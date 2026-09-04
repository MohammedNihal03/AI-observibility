import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import type { AgentEventInput, AgentEventType } from "@observatory/shared";
import { normalizeCommand, normalizePath } from "@observatory/telemetry";

/**
 * The Claude Code adapter (BUILD.md Phase 11, sections 43-45).
 *
 * Claude Code appends one JSON object per line to
 * `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl` as a session runs, so
 * reading a session needs no configuration, no hook, and no cooperation from
 * the agent. That file is the source here.
 *
 * ## What is deliberately NOT read
 *
 * The transcript contains full file contents, whole shell outputs and every
 * prompt. None of it is emitted. This adapter extracts the SHAPE of what the
 * agent did - which tool, which path, which command - and drops the payloads on
 * the floor. `Write` contributes a path and never its content; a tool result
 * contributes success or failure and never its output. Redaction still runs
 * downstream (section 48), but the cheapest way not to leak a secret is not to
 * carry it (section 49).
 *
 * ## The format is not a public API
 *
 * It is an internal implementation detail of a tool that updates weekly. Every
 * unparseable or unfamiliar line is skipped rather than fatal: an adapter that
 * refuses a whole session because one line grew a field is worse than one that
 * reports slightly less. `TranscriptParseResult.skipped` says how much was
 * ignored, so the gap is visible rather than silent.
 *
 * Verified against Claude Code 2.1.x transcripts. See docs/integrations.md.
 */

export const CLAUDE_CODE_HOME_DIR = ".claude";

/* -------------------------------------------------------------------------- */
/* Tool mapping                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Tool name to semantic event type.
 *
 * Section 11's counters classify files strictly by event type and refuse to
 * guess whether a path was read or written, so an adapter that emitted a bare
 * `tool_call` for everything would report zero files touched. The mapping is
 * therefore not cosmetic - it is what makes "12 files modified" true.
 */
const TOOL_EVENT_TYPES: Record<string, AgentEventType> = {
  Read: "file_read",
  NotebookRead: "file_read",
  Write: "file_write",
  Edit: "file_edit",
  MultiEdit: "file_edit",
  NotebookEdit: "file_edit",
  Grep: "search",
  Glob: "search",
  WebSearch: "search",
  WebFetch: "search",
};

/**
 * Longest command carried out of a transcript.
 *
 * A command line is normally an action's identity - `npm test`, `git status` -
 * and the whole point of keeping it. But a heredoc is also a command line, and
 * `python - <<'EOF' … EOF` carries an entire source file inside it. Measured on
 * a real session: median command 209 characters, but 40 of 140 ran past 400 and
 * the longest was 2,243 characters of embedded Python.
 *
 * Truncating bounds what an agent can smuggle into telemetry through its own
 * shell. The original length is appended so two different long commands still
 * produce different signatures, and so a reader can see that trimming happened
 * rather than wondering why a command looks half-finished.
 */
const MAX_COMMAND_LENGTH = 500;

function boundedCommand(command: string): string {
  if (command.length <= MAX_COMMAND_LENGTH) return command;
  return `${command.slice(0, MAX_COMMAND_LENGTH)} … [truncated, ${command.length} chars]`;
}

/** Where each tool keeps the thing it acted on, for the action signature. */
const TOOL_TARGET_KEYS: readonly string[] = [
  "pattern",
  "query",
  "url",
  "skill",
  "prompt",
  "task_id",
  "description",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

export interface TranscriptSession {
  readonly sessionId: string | null;
  /**
   * The title Claude Code generated for the session.
   *
   * Far better than the first user message, which is what the goal falls back
   * to: real prompts open with pasted code, IDE context, or a typo. Claude
   * refines the title as the session goes ("Phase 6" became "Phase 6 demo
   * generator"), so the LAST one is the one that saw the whole session.
   */
  readonly title: string | null;
  readonly model: string | null;
  readonly cwd: string | null;
  readonly gitBranch: string | null;
  readonly version: string | null;
  /** The first thing the user asked for, used for goal-drift (section 28). */
  readonly goal: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
}

export interface TranscriptParseResult {
  readonly session: TranscriptSession;
  readonly events: readonly AgentEventInput[];
  /** Lines that were not valid JSON. */
  readonly malformed: number;
  /** Lines understood but carrying nothing observable. */
  readonly skipped: number;
  /** Assistant lines whose usage repeated an already-counted `message.id`. */
  readonly duplicateUsage: number;
}

export interface ParseOptions {
  /**
   * Include sub-agent lines (`isSidechain: true`).
   *
   * Off by default. A sidechain is a DIFFERENT agent working on a delegated
   * task; folding its tool calls into the parent session would blend two
   * behaviours into one health score and make repetition detection compare
   * actions that were never taken by the same agent.
   */
  readonly includeSidechains?: boolean;
  /** Longest goal text kept. The goal feeds keyword matching, not display. */
  readonly maxGoalLength?: number;
}

const DEFAULT_MAX_GOAL = 240;

interface Mutable {
  sessionId: string | null;
  title: string | null;
  model: string | null;
  cwd: string | null;
  gitBranch: string | null;
  version: string | null;
  goal: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

/**
 * Blocks the harness injects into a user message that the user did not type.
 *
 * IDE selections, system reminders and slash-command scaffolding all arrive
 * inside the `user` line. Taking the first user message verbatim as the session
 * goal produced goals like `<ide_selection>The user selected lines 20 to 20 of
 * AddInvoicePopup.js…`, which then drove goal-drift scoring against a filename
 * the user never mentioned. Stripped before the goal is derived.
 */
const INJECTED_BLOCKS =
  /<(ide_selection|system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-stderr|user-prompt-submit-hook)>[\s\S]*?<\/\1>/giu;

/** Shortest remaining text that is worth treating as a stated goal. */
const MIN_GOAL_LENGTH = 8;

/**
 * The user's actual words, with injected context removed.
 *
 * Returns null when nothing is left, so the goal falls through to the next
 * message rather than latching onto scaffolding.
 */
export function extractGoalText(raw: string): string | null {
  const cleaned = raw
    .replace(INJECTED_BLOCKS, " ")
    // An unclosed injected block (truncated mid-write) leaves a dangling tag.
    .replace(/<\/?[a-z][a-z0-9-]*>/giu, " ")
    .replace(/^Caveat:[\s\S]*?<\/?[a-z-]+>/iu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return cleaned.length < MIN_GOAL_LENGTH ? null : cleaned;
}

/** Pulls the user's own words out of a `user` line, ignoring tool results. */
function userText(message: Record<string, unknown> | null): string | null {
  if (message === null) return null;
  const content = message["content"];

  if (typeof content === "string") return content.trim() === "" ? null : content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const entry of content) {
    const block = asRecord(entry);
    if (block === null || block["type"] !== "text") continue;
    const text = asString(block["text"]);
    if (text !== undefined) parts.push(text);
  }
  return parts.length === 0 ? null : parts.join(" ");
}

/**
 * Turns one `tool_use` block into an event.
 *
 * `callId` travels in metadata so the behaviour engine pairs actions with
 * results exactly, rather than by proximity. Claude Code issues tool calls in
 * parallel, and nearest-preceding pairing swaps results within a batch.
 */
function toolEvent(
  block: Record<string, unknown>,
  timestamp: string,
  cwd: string | null,
): AgentEventInput | null {
  const name = asString(block["name"]);
  if (name === undefined) return null;

  const input = asRecord(block["input"]) ?? {};
  const callId = asString(block["id"]);
  const type = TOOL_EVENT_TYPES[name] ?? "tool_call";

  // Paths and commands are made relative to the session's working directory
  // here, using the pipeline's own normalizer. The adapter is the only place
  // that knows the cwd - the server never sees it - and without this every
  // signature carries an absolute path, so the same edit made on two machines
  // reads as two different actions and the timeline shows
  // `c:/Users/.../apps/web/src/x.tsx` where `apps/web/src/x.tsx` was meant.
  const normalizeOptions = cwd === null ? {} : { cwd };

  const event: AgentEventInput = {
    source: "claude_code",
    type,
    timestamp,
    tool: { name },
    ...(callId !== undefined ? { metadata: { callId } } : {}),
  };

  const path = asString(input["file_path"]) ?? asString(input["notebook_path"]);
  if (path !== undefined) {
    event.files = { path: normalizePath(path, normalizeOptions) };
  }

  // Bash and PowerShell are the only tools whose subject is a command line.
  const command = asString(input["command"]);
  if (command !== undefined) {
    event.tool = {
      ...event.tool,
      name,
      command: boundedCommand(normalizeCommand(command, normalizeOptions)),
    };
  } else if (path === undefined) {
    // Neither a command nor a path: find something that identifies WHAT this
    // call acted on, or repetition detection cannot tell two of them apart.
    for (const key of TOOL_TARGET_KEYS) {
      const target = asString(input[key]);
      if (target !== undefined) {
        event.tool = { ...event.tool, name, target };
        break;
      }
    }
  }

  return event;
}

/**
 * Counts the lines a diff added and removed, without keeping any of them.
 *
 * `structuredPatch` carries the actual hunks - real source code - so it is
 * measured and dropped. Edit volume is one of the few honest measures of how
 * much work a session produced.
 */
function countPatch(patch: unknown): { added: number; removed: number } | null {
  if (!Array.isArray(patch)) return null;

  let added = 0;
  let removed = 0;
  for (const entry of patch) {
    const hunk = asRecord(entry);
    const lines = hunk?.["lines"];
    if (!Array.isArray(lines)) continue;
    for (const line of lines) {
      if (typeof line !== "string") continue;
      if (line.startsWith("+")) added += 1;
      else if (line.startsWith("-")) removed += 1;
    }
  }

  return { added, removed };
}

/**
 * Tool results, where `is_error` makes failure a fact rather than a guess.
 *
 * `detail` is the line-level `toolUseResult` that sits beside the content
 * block. It carries the diff and the timeout, neither of which appears in the
 * block itself.
 */
function resultEvent(
  block: Record<string, unknown>,
  detail: Record<string, unknown> | null,
  timestamp: string,
): AgentEventInput | null {
  const callId = asString(block["tool_use_id"]);

  /*
   * A command that ran out of time did not succeed.
   *
   * Claude Code records the timeout in `toolUseResult.timedOutAfterMs` but
   * leaves `is_error` false, so a 120-second timeout was being counted as a
   * successful tool call - inflating success rate and tool efficiency, and
   * hiding a failure mode that matters more than most.
   */
  const timedOutAfterMs = detail?.["timedOutAfterMs"];
  const timedOut = typeof timedOutAfterMs === "number";
  const failed = block["is_error"] === true || timedOut;

  const patch = countPatch(detail?.["structuredPatch"]);

  const metadata: Record<string, unknown> = {};
  if (callId !== undefined) metadata["callId"] = callId;
  if (timedOut) {
    metadata["timedOut"] = true;
    metadata["timedOutAfterMs"] = timedOutAfterMs;
  }
  if (patch !== null && patch.added + patch.removed > 0) {
    metadata["linesAdded"] = patch.added;
    metadata["linesRemoved"] = patch.removed;
  }

  return {
    source: "claude_code",
    type: "tool_result",
    timestamp,
    result: {
      status: failed ? "error" : "success",
      // Reported, not inferred: Claude Code states this outright, so nothing
      // downstream has to caveat it (section 66).
      confidence: "reported",
      ...(failed ? { exitCode: 1 } : { exitCode: 0 }),
    },
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

/**
 * Parses a Claude Code transcript.
 *
 * Pure: strings in, events out, no filesystem. The reader below supplies the
 * lines, which is what lets the mapping be tested against fixtures rather than
 * against whatever happens to be in a developer's home directory.
 */
export function parseTranscript(
  lines: Iterable<string>,
  options: ParseOptions = {},
): TranscriptParseResult {
  const maxGoal = options.maxGoalLength ?? DEFAULT_MAX_GOAL;
  const events: AgentEventInput[] = [];
  const seenUsage = new Set<string>();

  const state: Mutable = {
    sessionId: null,
    title: null,
    model: null,
    cwd: null,
    gitBranch: null,
    version: null,
    goal: null,
    startedAt: null,
    endedAt: null,
  };

  let malformed = 0;
  let skipped = 0;
  let duplicateUsage = 0;

  for (const line of lines) {
    if (line.trim() === "") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      malformed += 1;
      continue;
    }

    const entry = asRecord(parsed);
    if (entry === null) {
      malformed += 1;
      continue;
    }

    if (entry["isSidechain"] === true && options.includeSidechains !== true) {
      skipped += 1;
      continue;
    }

    state.sessionId ??= asString(entry["sessionId"]) ?? null;
    state.cwd ??= asString(entry["cwd"]) ?? null;
    state.gitBranch ??= asString(entry["gitBranch"]) ?? null;
    state.version ??= asString(entry["version"]) ?? null;

    const timestamp = asString(entry["timestamp"]);
    if (timestamp !== undefined) {
      state.startedAt ??= timestamp;
      state.endedAt = timestamp;
    }

    const type = asString(entry["type"]);
    const message = asRecord(entry["message"]);

    if (type === "user") {
      if (timestamp === undefined) {
        skipped += 1;
        continue;
      }

      const content = message?.["content"];
      let emitted = false;

      if (Array.isArray(content)) {
        for (const item of content) {
          const block = asRecord(item);
          if (block === null || block["type"] !== "tool_result") continue;
          const event = resultEvent(block, asRecord(entry["toolUseResult"]), timestamp);
          if (event !== null) {
            events.push(event);
            emitted = true;
          }
        }
      }

      const text = userText(message);
      if (text !== null) {
        if (state.goal === null) {
          const goal = extractGoalText(text);
          if (goal !== null) state.goal = goal.slice(0, maxGoal);
        }
        events.push({ source: "claude_code", type: "user_message", timestamp });
        emitted = true;
      }

      if (!emitted) skipped += 1;
      continue;
    }

    if (type === "assistant") {
      if (timestamp === undefined) {
        skipped += 1;
        continue;
      }

      state.model ??= asString(message?.["model"]) ?? null;

      // Token usage is deduplicated by `message.id`. One API response is
      // written as several assistant lines - a thinking block, a text block,
      // one per tool_use - and EVERY one repeats the same usage object. On the
      // session that produced this file, 480 lines carried 312 distinct ids;
      // summing per line would have overcounted tokens by half again.
      const usage = asRecord(message?.["usage"]);
      const messageId = asString(message?.["id"]);
      if (usage !== null) {
        if (messageId !== undefined && seenUsage.has(messageId)) {
          duplicateUsage += 1;
        } else {
          if (messageId !== undefined) seenUsage.add(messageId);
          const input = asCount(usage["input_tokens"]);
          const output = asCount(usage["output_tokens"]);
          // Cached reads and cache writes are both part of the prompt the model
          // was handed, so both belong in the live context figure (section 29).
          const cached =
            asCount(usage["cache_read_input_tokens"]) +
            asCount(usage["cache_creation_input_tokens"]);

          if (input + output + cached > 0) {
            const details = asRecord(usage["output_tokens_details"]);
            // Thinking is already inside `output_tokens`, so it travels as its
            // own figure rather than being added again.
            const thinking = asCount(details?.["thinking_tokens"]);
            const cacheRead = asCount(usage["cache_read_input_tokens"]);
            const cacheCreation = asCount(usage["cache_creation_input_tokens"]);

            events.push({
              source: "claude_code",
              type: "model_response",
              timestamp,
              tokens: { input, output, cached },
              metadata: {
                ...(messageId !== undefined ? { messageId } : {}),
                ...(thinking > 0 ? { thinkingTokens: thinking } : {}),
                ...(cacheRead > 0 ? { cacheRead } : {}),
                ...(cacheCreation > 0 ? { cacheCreation } : {}),
              },
            });
          }
        }
      }

      let emitted = false;
      for (const item of Array.isArray(message?.["content"]) ? message["content"] : []) {
        const block = asRecord(item);
        if (block === null || block["type"] !== "tool_use") continue;
        const event = toolEvent(block, timestamp, state.cwd);
        if (event !== null) {
          events.push(event);
          emitted = true;
        }
      }

      if (!emitted && usage === null) skipped += 1;
      continue;
    }

    if (type === "ai-title") {
      // Overwritten deliberately: the title improves as the session goes on.
      const title = asString(entry["aiTitle"]);
      if (title !== undefined) state.title = title;
      skipped += 1;
      continue;
    }

    // Bookkeeping lines: last-prompt, file-history-snapshot, and whatever the
    // next release adds. Counted, not fatal.
    skipped += 1;
  }

  /*
   * A synthesized session-start event.
   *
   * Claude Code writes no explicit "session began" line, but the session did
   * begin, and the server reads session-level facts from event metadata rather
   * than from a side channel. Emitted last and prepended because the title is
   * only final once the whole transcript has been read.
   */
  if (state.startedAt !== null) {
    events.unshift({
      source: "claude_code",
      type: "session_started",
      timestamp: state.startedAt,
      metadata: {
        ...(state.title !== null ? { title: state.title } : {}),
        ...(state.gitBranch !== null ? { gitBranch: state.gitBranch } : {}),
        ...(state.version !== null ? { agentVersion: state.version } : {}),
      },
    });
  }

  return {
    session: {
      sessionId: state.sessionId,
      title: state.title,
      model: state.model,
      cwd: state.cwd,
      gitBranch: state.gitBranch,
      version: state.version,
      goal: state.goal,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
    },
    events,
    malformed,
    skipped,
    duplicateUsage,
  };
}

/* -------------------------------------------------------------------------- */
/* Discovery                                                                  */
/* -------------------------------------------------------------------------- */

export interface TranscriptFile {
  readonly path: string;
  readonly sessionId: string;
  /** The project directory slug Claude Code derived from the session's cwd. */
  readonly project: string;
  readonly modifiedAt: string;
  readonly sizeBytes: number;
}

export interface DiscoverOptions {
  /** Home directory. Injected so tests never read a real developer's sessions. */
  readonly home?: string;
  /** Only sessions whose project slug contains this string. */
  readonly project?: string;
  readonly limit?: number;
}

/**
 * Lists transcripts, newest first.
 *
 * Missing directories are not an error: a machine with no Claude Code installed
 * simply has no sessions, and that is an empty list rather than a failure.
 */
export async function findTranscripts(
  options: DiscoverOptions = {},
): Promise<readonly TranscriptFile[]> {
  const root = join(options.home ?? homedir(), CLAUDE_CODE_HOME_DIR, "projects");

  let projects: string[];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    projects = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }

  const matching =
    options.project === undefined
      ? projects
      : projects.filter((name) => name.toLowerCase().includes(options.project!.toLowerCase()));

  const found: TranscriptFile[] = [];

  for (const project of matching) {
    let files: string[];
    try {
      files = (await readdir(join(root, project))).filter((name) => name.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const name of files) {
      const path = join(root, project, name);
      try {
        const info = await stat(path);
        found.push({
          path,
          sessionId: basename(name, ".jsonl"),
          project,
          modifiedAt: info.mtime.toISOString(),
          sizeBytes: info.size,
        });
      } catch {
        // Deleted between the listing and the stat. Not our problem.
      }
    }
  }

  found.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return options.limit === undefined ? found : found.slice(0, options.limit);
}

/** Reads and parses one transcript file. */
export async function readTranscript(
  path: string,
  options: ParseOptions = {},
): Promise<TranscriptParseResult> {
  const text = await readFile(path, "utf8");
  return parseTranscript(text.split("\n"), options);
}
