import type { AgentEventInput, NormalizedAgentEvent } from "@observatory/shared";

/**
 * Step 2 of the pipeline (BUILD.md section 10): normalization.
 *
 * Normalization exists to serve repetition detection (section 15). Two
 * invocations of the same action must produce the same signature even if the
 * agent typed them with different spacing or referred to a file by an absolute
 * path one time and a relative path the next.
 *
 * What is deliberately NOT normalized:
 *
 * - **Case.** Commands are case-sensitive on POSIX. Lowercasing would merge
 *   genuinely different commands.
 * - **Most flags.** Section 15 permits dropping insignificant flags "where
 *   safe". Almost no flag is safe to drop in general: `-p` means port to Docker
 *   and package to npm. Only provably cosmetic flags are dropped, the list is
 *   short, and it is configurable.
 *
 * Over-normalizing is worse than under-normalizing: merging two different
 * actions invents a repetition that never happened.
 */

export const DEFAULT_INSIGNIFICANT_FLAGS: readonly string[] = [
  "--color",
  "--no-color",
  "--progress",
  "--no-progress",
];

export interface NormalizeOptions {
  /** Working directory of the observed session; paths under it become relative. */
  readonly cwd?: string;
  /** Home directory; paths under it collapse to `~`. */
  readonly homeDir?: string;
  /** Cosmetic flags to drop from commands. Defaults to `DEFAULT_INSIGNIFICANT_FLAGS`. */
  readonly insignificantFlags?: readonly string[];
}

export interface NormalizeContext {
  /** Session the event belongs to. Used when the payload omits `sessionId`. */
  readonly sessionId: string;
  /** Identifier to assign when the payload omits `id`. */
  readonly id: string;
  /** Timestamp to assign when the payload omits `timestamp`. ISO 8601. */
  readonly timestamp: string;
  readonly options?: NormalizeOptions;
}

/** Trims and collapses every run of whitespace to a single space. */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Builds a matcher for a directory prefix that accepts either path separator,
 * so a Windows `cwd` still matches a command that used forward slashes.
 *
 * Split first, then escape each segment, then join with a separator class.
 * Doing it by successive `replace` calls over the escaped string does not work:
 * the pass that handles backslashes inserts a `[\\/]` class, and the pass that
 * handles forward slashes then rewrites the slash inside that class, producing
 * `[\\[\\/]]` and an invalid regex. That only shows up for a `cwd` written with
 * backslashes, which is every real Windows session.
 */
function prefixMatcher(prefix: string): RegExp {
  const segments = prefix
    .replace(/[\\/]+$/u, "")
    .split(/[\\/]+/u)
    .map(escapeRegExp);
  return new RegExp(segments.join("[\\\\/]"), "giu");
}

/**
 * Normalizes a filesystem path: forward slashes, no duplicate separators,
 * lowercased drive letter, and relative to `cwd` or `~` where possible.
 *
 * Machine-specific paths that fall outside both are left intact rather than
 * replaced with a placeholder - discarding them would make two edits to
 * different files look like the same action.
 */
export function normalizePath(value: string, options: NormalizeOptions = {}): string {
  let path = value.trim().replace(/^file:\/\//iu, "");
  path = path.replace(/\\/gu, "/").replace(/\/{2,}/gu, "/");
  // `file:///c:/tmp/a.ts` leaves a slash in front of the drive letter.
  path = path.replace(/^\/([a-zA-Z]:\/)/u, "$1");
  path = path.replace(/^([a-zA-Z]):\//u, (_match, drive: string) => `${drive.toLowerCase()}:/`);

  const cwd = options.cwd?.replace(/\\/gu, "/").replace(/\/+$/u, "");
  if (cwd !== undefined && cwd !== "") {
    const normalizedCwd = cwd.replace(/^([a-zA-Z]):\//u, (_m, d: string) => `${d.toLowerCase()}:/`);
    if (path.toLowerCase().startsWith(`${normalizedCwd.toLowerCase()}/`)) {
      path = path.slice(normalizedCwd.length + 1);
    } else if (path.toLowerCase() === normalizedCwd.toLowerCase()) {
      path = ".";
    }
  }

  const home = options.homeDir?.replace(/\\/gu, "/").replace(/\/+$/u, "");
  if (home !== undefined && home !== "") {
    const normalizedHome = home.replace(
      /^([a-zA-Z]):\//u,
      (_m, d: string) => `${d.toLowerCase()}:/`,
    );
    if (path.toLowerCase().startsWith(`${normalizedHome.toLowerCase()}/`)) {
      path = `~/${path.slice(normalizedHome.length + 1)}`;
    }
  }

  return path.replace(/^\.\//u, "");
}

function stripFlag(tokens: readonly string[], flag: string): string[] {
  return tokens.filter((token) => token !== flag && !token.startsWith(`${flag}=`));
}

/**
 * Normalizes a shell command for comparison: whitespace collapsed, trailing
 * separators removed, environment-specific paths made relative, and cosmetic
 * flags dropped.
 */
export function normalizeCommand(value: string, options: NormalizeOptions = {}): string {
  let command = normalizeWhitespace(value)
    .replace(/[;&]+$/u, "")
    .trim();

  const cwd = options.cwd;
  if (cwd !== undefined && cwd !== "") {
    command = command.replace(prefixMatcher(cwd), ".");
  }
  const home = options.homeDir;
  if (home !== undefined && home !== "") {
    command = command.replace(prefixMatcher(home), "~");
  }
  command = command.replace(/\\/gu, "/").replace(/(^|\s)\.\//gu, "$1");

  const flags = options.insignificantFlags ?? DEFAULT_INSIGNIFICANT_FLAGS;
  let tokens = command.split(" ").filter((token) => token !== "");
  for (const flag of flags) {
    tokens = stripFlag(tokens, flag);
  }

  return tokens.join(" ");
}

/**
 * A stable identity for the ACTION an event performed.
 *
 * The result status is intentionally excluded: the same command failing three
 * times must yield the same signature three times, which is exactly what makes
 * repeated-failure detection possible (sections 15, 16).
 */
export function eventSignature(
  event: Pick<AgentEventInput, "type" | "tool" | "files">,
  options: NormalizeOptions = {},
): string {
  const parts: string[] = [event.type];

  const command = event.tool?.command;
  if (command !== undefined && command.trim() !== "") {
    if (event.tool?.name !== undefined) parts.push(`tool:${event.tool.name}`);
    parts.push(`cmd:${normalizeCommand(command, options)}`);
    return parts.join("|");
  }

  const path = event.files?.path;
  if (path !== undefined && path.trim() !== "") {
    if (event.tool?.name !== undefined) parts.push(`tool:${event.tool.name}`);
    parts.push(`path:${normalizePath(path, options)}`);
    return parts.join("|");
  }

  if (event.tool?.name !== undefined) {
    parts.push(`tool:${event.tool.name}`);
  }

  return parts.join("|");
}

/**
 * Turns a validated payload into a complete, normalized event.
 *
 * Values supplied by the caller win over the context: a collector reading a
 * transcript knows the real event time and id, and we must not overwrite them
 * with "now".
 *
 * Deterministic by construction - the id and timestamp fallbacks are passed in
 * rather than read from a clock or a random source (section 57).
 */
export function normalizeEvent(
  input: AgentEventInput,
  context: NormalizeContext,
): NormalizedAgentEvent {
  const options = context.options ?? {};

  const normalized: NormalizedAgentEvent = {
    ...input,
    id: input.id ?? context.id,
    sessionId: input.sessionId ?? context.sessionId,
    timestamp: input.timestamp ?? context.timestamp,
    signature: eventSignature(input, options),
  };

  if (input.tool !== undefined) {
    normalized.tool = {
      ...input.tool,
      ...(input.tool.command !== undefined
        ? { command: normalizeWhitespace(input.tool.command) }
        : {}),
    };
  }

  if (input.files?.path !== undefined) {
    normalized.files = { ...input.files, path: normalizePath(input.files.path, options) };
  }

  return normalized;
}
