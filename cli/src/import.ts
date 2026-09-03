import {
  findTranscripts,
  readTranscript,
  type TranscriptFile,
  type TranscriptParseResult,
} from "@observatory/collectors";
import type { AgentEventInput } from "@observatory/shared";

import { createApiClient, type ApiClient } from "./api.js";

/**
 * `observatory import` (BUILD.md Phase 11).
 *
 * Reads a real Claude Code session off disk and feeds it to the local API. The
 * events go through the same validation, redaction and analysis as everything
 * else - the adapter's only job is translation, and nothing about a real
 * session takes a different path through the engine than a simulated one.
 *
 * Re-importing is safe. The server is asked how many events it already holds
 * and only the remainder is sent, which is also what makes `--watch` work: the
 * same code appends whatever the agent has done since the last look.
 */

export interface ImportOptions {
  /** An explicit transcript path. Otherwise one is discovered. */
  readonly file?: string;
  /** Pick a session by its Claude Code id. */
  readonly sessionId?: string;
  /** Restrict discovery to project directories containing this string. */
  readonly project?: string;
  readonly home?: string;
  readonly server?: string;
  readonly client?: ApiClient;
  readonly includeSidechains?: boolean;
  /** Keep following the file as the agent works. */
  readonly watch?: boolean;
  readonly pollMs?: number;
  /** Events per request. Batching keeps a 1500-line transcript to a few calls. */
  readonly batchSize?: number;
  readonly onProgress?: (message: string) => void;
  /** Returns false to stop watching. Injected for tests. */
  readonly shouldContinue?: () => boolean;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface ImportResult {
  readonly sessionId: string;
  readonly file: string;
  readonly sent: number;
  readonly alreadyStored: number;
  readonly redactions: number;
  readonly parsed: TranscriptParseResult;
  readonly server: string;
}

export class NoTranscriptError extends Error {
  constructor(detail: string) {
    super(
      `No Claude Code session transcript found${detail}.\n` +
        `Claude Code writes them to ~/.claude/projects/<project>/<sessionId>.jsonl once a session runs.`,
    );
    this.name = "NoTranscriptError";
  }
}

const DEFAULT_BATCH = 200;
const DEFAULT_POLL_MS = 1_000;

const wait = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

/** Lists what could be imported, newest first. */
export function listSessions(options: ImportOptions = {}): Promise<readonly TranscriptFile[]> {
  return findTranscripts({
    ...(options.home !== undefined ? { home: options.home } : {}),
    ...(options.project !== undefined ? { project: options.project } : {}),
    limit: 25,
  });
}

async function resolveFile(options: ImportOptions): Promise<TranscriptFile> {
  if (options.file !== undefined) {
    return { path: options.file, sessionId: "", project: "", modifiedAt: "", sizeBytes: 0 };
  }

  const candidates = await findTranscripts({
    ...(options.home !== undefined ? { home: options.home } : {}),
    ...(options.project !== undefined ? { project: options.project } : {}),
  });

  if (options.sessionId !== undefined) {
    const match = candidates.find((entry) => entry.sessionId.startsWith(options.sessionId!));
    if (match === undefined) throw new NoTranscriptError(` for session "${options.sessionId}"`);
    return match;
  }

  const newest = candidates[0];
  if (newest === undefined) {
    throw new NoTranscriptError(
      options.project === undefined ? "" : ` under a project matching "${options.project}"`,
    );
  }
  return newest;
}

/**
 * The session id used in the Observatory.
 *
 * Prefixed rather than raw so that provenance is legible at a glance and a
 * Claude Code uuid can never collide with a demo session's id.
 */
function observatoryId(sessionId: string): string {
  return `cc_${sessionId}`;
}

export async function importClaudeCodeSession(options: ImportOptions = {}): Promise<ImportResult> {
  const client = options.client ?? createApiClient(options.server);
  const sleep = options.sleep ?? wait;
  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  const progress = options.onProgress ?? ((): void => {});

  const file = await resolveFile(options);
  const parseOptions =
    options.includeSidechains === true ? { includeSidechains: true } : ({} as const);

  let parsed = await readTranscript(file.path, parseOptions);
  const transcriptId = parsed.session.sessionId ?? file.sessionId;
  if (transcriptId === "") throw new NoTranscriptError(` in ${file.path}`);

  const sessionId = observatoryId(transcriptId);

  // Create the session only if the server does not have it. Re-running the
  // import must append, not duplicate.
  let alreadyStored = 0;
  try {
    const existing = await client.getSession(sessionId);
    alreadyStored = existing.session.eventCount;
  } catch {
    await client.createSession({
      id: sessionId,
      source: "claude_code",
      ...(parsed.session.model !== null ? { model: parsed.session.model } : {}),
      ...(parsed.session.goal !== null ? { goal: parsed.session.goal } : {}),
      ...(parsed.session.startedAt !== null ? { startedAt: parsed.session.startedAt } : {}),
    });
  }

  let sent = 0;
  let redactions = 0;

  const push = async (events: readonly AgentEventInput[]): Promise<void> => {
    for (let index = 0; index < events.length; index += batchSize) {
      const batch = events.slice(index, index + batchSize);
      const result = await client.sendEvents(sessionId, batch);
      sent += result.accepted;
      redactions += result.redactions;
      progress(`  sent ${sent} events`);
    }
  };

  await push(parsed.events.slice(alreadyStored));
  let delivered = Math.max(alreadyStored, parsed.events.length);

  if (options.watch === true) {
    const shouldContinue = options.shouldContinue ?? ((): boolean => true);
    progress(`Watching ${file.path}`);

    while (shouldContinue()) {
      await sleep(options.pollMs ?? DEFAULT_POLL_MS);
      if (!shouldContinue()) break;

      // The whole file is re-read and re-parsed each tick. Tracking a byte
      // offset would be faster, but a transcript is appended mid-line while
      // the agent is writing, and a torn final line is a parse error rather
      // than a smaller read. Re-parsing 1500 lines costs a few milliseconds.
      const next = await readTranscript(file.path, parseOptions);
      if (next.events.length > delivered) {
        await push(next.events.slice(delivered));
        delivered = next.events.length;
        parsed = next;
      }
    }
  }

  return {
    sessionId,
    file: file.path,
    sent,
    alreadyStored,
    redactions,
    parsed,
    server: client.server,
  };
}
