import {
  isActionEvent,
  isFailure,
  isOutcomeEvent,
  isSuccess,
  type AgentEvent,
  type SessionCounters,
} from "@observatory/shared";

/**
 * Basic counters (BUILD.md sections 9, 11).
 *
 * Pure and single-pass. Counting rules that involved a judgement call are
 * documented at the point of decision rather than left implicit, because a
 * counter whose definition is unclear is worse than no counter.
 */

export interface CounterDetail extends SessionCounters {
  /** Outcome events whose status was reported either way. */
  readonly resolvedOutcomes: number;
  readonly successfulOutcomes: number;
  readonly failedOutcomes: number;
  /** Outcome events that reported neither success nor failure. */
  readonly unresolvedOutcomes: number;
  /** `tool_result` events, the population tool efficiency is measured over. */
  readonly toolResults: number;
  /** `tool_result` events that reported neither success nor failure. */
  readonly unresolvedToolResults: number;
  /** Tool invocations for which no result ever arrived. */
  readonly unresolvedToolCalls: number;
}

// The invocation population comes from `isActionEvent` in @observatory/shared.
// It is deliberately not redefined here: when this package had its own list,
// tool efficiency divided result-derived successes by a narrower denominator
// and exceeded 1 on a real session.

const EMPTY: CounterDetail = {
  totalEvents: 0,
  totalToolCalls: 0,
  successfulToolCalls: 0,
  failedToolCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  filesRead: 0,
  filesModified: 0,
  commandsExecuted: 0,
  errors: 0,
  warnings: 0,
  resolvedOutcomes: 0,
  successfulOutcomes: 0,
  failedOutcomes: 0,
  unresolvedOutcomes: 0,
  toolResults: 0,
  unresolvedToolResults: 0,
  unresolvedToolCalls: 0,
};

export function emptyCounters(): CounterDetail {
  return EMPTY;
}

export function computeCounters(events: readonly AgentEvent[]): CounterDetail {
  if (events.length === 0) return EMPTY;

  let totalToolCalls = 0;
  let successfulOutcomes = 0;
  let failedOutcomes = 0;
  let unresolvedOutcomes = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let commandsExecuted = 0;
  let errors = 0;
  let warnings = 0;

  // Files are counted as DISTINCT PATHS, not operations. "Files modified: 12"
  // reading as twelve files is what a developer expects; twelve edits to one
  // file is a repetition signal, which is Phase 5's job to report.
  const filesRead = new Set<string>();
  const filesModified = new Set<string>();

  for (const event of events) {
    inputTokens += event.tokens?.input ?? 0;
    outputTokens += event.tokens?.output ?? 0;
    cachedTokens += event.tokens?.cached ?? 0;

    if (event.type === "warning") warnings += 1;
    // `errors` counts anything that failed, not just events typed "error":
    // a failed command and a failed test are errors too (section 14).
    if (isFailure(event)) errors += 1;

    if (isActionEvent(event)) totalToolCalls += 1;

    // A command was executed if the collector said so, or if a tool call
    // carried a command string. Both spellings occur: the generic API uses
    // command_started, while a Claude Code Bash call arrives as a tool_call.
    if (event.type === "command_started") {
      commandsExecuted += 1;
    } else if (event.type === "tool_call" && event.tool?.command !== undefined) {
      commandsExecuted += 1;
    }

    // Counted strictly by semantic type. A bare `tool_call` carrying a path is
    // NOT counted, because whether it read or wrote the file is unknown and
    // guessing would fabricate a measurement. Adapters must emit file_read /
    // file_write / file_edit - that is what those event types are for.
    const path = event.files?.path;
    if (path !== undefined && path !== "") {
      if (event.type === "file_read") filesRead.add(path);
      if (event.type === "file_write" || event.type === "file_edit") filesModified.add(path);
    }

    if (isOutcomeEvent(event)) {
      if (isSuccess(event)) successfulOutcomes += 1;
      else if (isFailure(event)) failedOutcomes += 1;
      else unresolvedOutcomes += 1;
    }
  }

  const resolvedOutcomes = successfulOutcomes + failedOutcomes;

  // Tool success is measured from tool_result events specifically, so that a
  // failing shell command reported as command_finished is not counted as a tool
  // failure as well. Those are covered by the success/error rate instead.
  let toolResults = 0;
  let successfulToolCalls = 0;
  let failedToolCalls = 0;
  for (const event of events) {
    if (event.type !== "tool_result") continue;
    toolResults += 1;
    if (isSuccess(event)) successfulToolCalls += 1;
    else if (isFailure(event)) failedToolCalls += 1;
  }

  return {
    totalEvents: events.length,
    totalToolCalls,
    successfulToolCalls,
    failedToolCalls,
    inputTokens,
    outputTokens,
    cachedTokens,
    filesRead: filesRead.size,
    filesModified: filesModified.size,
    commandsExecuted,
    errors,
    warnings,
    resolvedOutcomes,
    successfulOutcomes,
    failedOutcomes,
    unresolvedOutcomes,
    toolResults,
    unresolvedToolResults: toolResults - (successfulToolCalls + failedToolCalls),
    unresolvedToolCalls: Math.max(0, totalToolCalls - toolResults),
  };
}

/**
 * Wall-clock span covered by the events.
 *
 * Null for an empty list. Zero for a single event is correct - the session
 * covers no measurable time yet.
 */
export function computeDurationMs(events: readonly AgentEvent[]): number | null {
  if (events.length === 0) return null;

  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    const time = Date.parse(event.timestamp);
    if (Number.isNaN(time)) continue;
    if (time < earliest) earliest = time;
    if (time > latest) latest = time;
  }

  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return null;
  return latest - earliest;
}
