import { z } from "zod";

/**
 * The normalized event system (BUILD.md section 8).
 *
 * Everything in the Observatory revolves around `AgentEvent`. Collectors
 * translate whatever their agent produces into this shape, and nothing
 * downstream of the collector knows which agent it came from.
 *
 * Extensibility: the schema strips unknown top-level keys rather than
 * rejecting them, so a newer collector talking to an older server degrades
 * instead of failing. Adapter-specific extras belong in `metadata`.
 */

export const AGENT_SOURCES = ["claude_code", "codex", "generic"] as const;
export type AgentSource = (typeof AGENT_SOURCES)[number];
export const agentSourceSchema = z.enum(AGENT_SOURCES);

export const AGENT_EVENT_TYPES = [
  "session_started",
  "session_ended",
  "user_message",
  "assistant_message",
  "tool_call",
  "tool_result",
  "file_read",
  "file_write",
  "file_edit",
  "command_started",
  "command_finished",
  "test_started",
  "test_finished",
  "error",
  "warning",
  "search",
  "git_operation",
  "context_update",
  "model_response",
] as const;
export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];
export const agentEventTypeSchema = z.enum(AGENT_EVENT_TYPES);

export const RESULT_STATUSES = ["success", "error", "unknown"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];
export const resultStatusSchema = z.enum(RESULT_STATUSES);

/**
 * How the Observatory came to know a result's status.
 *
 * `reported`  the agent stated it outright (Claude Code sets `is_error`).
 * `inferred`  we derived it from unstructured output (Codex tool results carry
 *             no exit code, so success has to be read out of text).
 *
 * This distinction exists so the product never presents a guess as a
 * measurement (BUILD.md section 66). Absent means `reported`.
 */
export const RESULT_CONFIDENCES = ["reported", "inferred"] as const;
export type ResultConfidence = (typeof RESULT_CONFIDENCES)[number];
export const resultConfidenceSchema = z.enum(RESULT_CONFIDENCES);

const nonEmptyString = z.string().min(1);
const tokenCount = z.number().int().nonnegative();

/** ISO 8601, offsets allowed - agents on machines that are not on UTC exist. */
export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const eventToolSchema = z.object({
  name: nonEmptyString,
  command: z.string().optional(),
  /**
   * What the tool acted on, when it is not a command or a file path: a search
   * pattern, a URL, a query.
   *
   * This exists because repetition detection needs to tell two calls to the
   * same tool apart. Without it, fourteen different `Grep` searches all reduce
   * to the signature `tool_call|tool:Grep` and read as one action repeated
   * fourteen times - which on a real session produced a 60% repetition rate and
   * a fabricated "repetition increased 414%" finding.
   *
   * Adapters should populate it for any tool whose behavior is driven by an
   * argument other than a command or path.
   */
  target: z.string().optional(),
});

export const eventResultSchema = z.object({
  status: resultStatusSchema.optional(),
  exitCode: z.number().int().optional(),
  durationMs: z.number().nonnegative().optional(),
  confidence: resultConfidenceSchema.optional(),
});

export const eventTokensSchema = z.object({
  input: tokenCount.optional(),
  output: tokenCount.optional(),
  cached: tokenCount.optional(),
});

export const eventFilesSchema = z.object({
  path: z.string().optional(),
});

/** Fields every event carries, regardless of whether it has been persisted. */
const eventBodyShape = {
  source: agentSourceSchema,
  type: agentEventTypeSchema,
  tool: eventToolSchema.optional(),
  result: eventResultSchema.optional(),
  tokens: eventTokensSchema.optional(),
  files: eventFilesSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
} as const;

/** A complete event: identified, timestamped and attached to a session. */
export const agentEventSchema = z.object({
  id: nonEmptyString,
  sessionId: nonEmptyString,
  timestamp: isoTimestampSchema,
  ...eventBodyShape,
});
export type AgentEvent = z.infer<typeof agentEventSchema>;

/**
 * What a collector or API client is allowed to send.
 *
 * `id`, `sessionId` and `timestamp` are optional on the way in: the ingestion
 * pipeline fills them (the session id usually comes from the request path).
 * Everything else must be supplied - we never guess what an agent did.
 */
export const agentEventInputSchema = z.object({
  id: nonEmptyString.optional(),
  sessionId: nonEmptyString.optional(),
  timestamp: isoTimestampSchema.optional(),
  ...eventBodyShape,
});
export type AgentEventInput = z.infer<typeof agentEventInputSchema>;

/**
 * An event after normalization: identical to `AgentEvent` plus a stable
 * `signature` describing the ACTION it performed, with volatile details
 * (whitespace, absolute paths, cosmetic flags) removed.
 *
 * Repetition detection compares signatures, never raw commands, which is why
 * the signature deliberately excludes the result: the same action failing three
 * times must produce the same signature three times (sections 15, 16).
 */
export const normalizedAgentEventSchema = agentEventSchema.extend({
  signature: nonEmptyString,
});
export type NormalizedAgentEvent = z.infer<typeof normalizedAgentEventSchema>;

/**
 * Event types where the agent invoked something - the canonical "action".
 *
 * This is the ONE definition of an action in the codebase. `totalToolCalls`
 * counts it, repetition is detected over it, and repetition rate divides by it.
 * When those populations were allowed to differ, tool efficiency exceeded 1 on
 * a real session and was silently clamped to a flattering 100%.
 *
 * File operations belong here: adapters are required to emit semantic types, so
 * a Claude Code `Read` arrives as `file_read` and is every bit as much an agent
 * action as a `Bash` call.
 */
export const ACTION_EVENT_TYPES: readonly AgentEventType[] = [
  "tool_call",
  "file_read",
  "file_write",
  "file_edit",
  "command_started",
  "test_started",
  "search",
  "git_operation",
];

/** Event types that report the outcome of an action. */
export const OUTCOME_EVENT_TYPES: readonly AgentEventType[] = [
  "tool_result",
  "command_finished",
  "test_finished",
];

/** Event types that touch the filesystem. */
export const FILE_EVENT_TYPES: readonly AgentEventType[] = ["file_read", "file_write", "file_edit"];

export function isActionEvent(event: Pick<AgentEvent, "type">): boolean {
  return ACTION_EVENT_TYPES.includes(event.type);
}

export function isOutcomeEvent(event: Pick<AgentEvent, "type">): boolean {
  return OUTCOME_EVENT_TYPES.includes(event.type);
}

export function isFileEvent(event: Pick<AgentEvent, "type">): boolean {
  return FILE_EVENT_TYPES.includes(event.type);
}

/**
 * Whether an event represents a failure.
 *
 * Deterministic and explicit: an `error` event, or an outcome whose status is
 * `error`, or a non-zero exit code. An absent status is NOT a failure - unknown
 * stays unknown.
 */
export function isFailure(event: Pick<AgentEvent, "type" | "result">): boolean {
  if (event.type === "error") return true;
  if (event.result?.status === "error") return true;
  return event.result?.exitCode !== undefined && event.result.exitCode !== 0;
}

/** Whether an event represents a confirmed success. */
export function isSuccess(event: Pick<AgentEvent, "type" | "result">): boolean {
  if (isFailure(event)) return false;
  if (event.result?.status === "success") return true;
  return event.result?.exitCode === 0;
}
