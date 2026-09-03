import {
  isActionEvent,
  type AgentEvent,
  type BehavioralCounts,
  type MetricsSnapshotCreate,
  type SessionMetrics,
} from "@observatory/shared";

import { computeCounters, computeDurationMs } from "./counters.js";
import { behavioralRates, errorRate, successRate, toolEfficiency } from "./rates.js";
import { round } from "./ratio.js";
import {
  computeContextUsage,
  computeCost,
  type ContextOptions,
  type CostOptions,
} from "./tokens.js";

/**
 * The metrics engine entry point (BUILD.md section 11).
 *
 * One pure function: events in, the full metric set out. No I/O, no clock, no
 * randomness, no LLM (sections 49, 50, 57). Call it twice with the same input
 * and the output is identical, which is what makes the demo scenarios testable.
 */

export interface SessionMetricsOptions {
  readonly context?: ContextOptions;
  readonly cost?: CostOptions;
  /**
   * Counts that only sequence analysis can produce (Phase 5). Absent means the
   * behavior engine has not run, and the rates that depend on it stay null
   * rather than defaulting to zero.
   */
  readonly behavior?: BehavioralCounts;
}

/** Actions are what repetition is measured against (section 15). */
export function countActions(events: readonly AgentEvent[]): number {
  let total = 0;
  for (const event of events) {
    if (isActionEvent(event)) total += 1;
  }
  return total;
}

export function computeSessionMetrics(
  events: readonly AgentEvent[],
  options: SessionMetricsOptions = {},
): SessionMetrics {
  const counters = computeCounters(events);
  const context = computeContextUsage(events, options.context);
  const cost = computeCost(context.tokens, options.cost);

  const behavior =
    options.behavior !== undefined
      ? behavioralRates(options.behavior, countActions(events))
      : { recoveryRate: null, repetitionRate: null, correctionLoopRate: null };

  return {
    counters: {
      totalEvents: counters.totalEvents,
      totalToolCalls: counters.totalToolCalls,
      successfulToolCalls: counters.successfulToolCalls,
      failedToolCalls: counters.failedToolCalls,
      inputTokens: counters.inputTokens,
      outputTokens: counters.outputTokens,
      cachedTokens: counters.cachedTokens,
      filesRead: counters.filesRead,
      filesModified: counters.filesModified,
      commandsExecuted: counters.commandsExecuted,
      errors: counters.errors,
      warnings: counters.warnings,
    },

    successRate: round(successRate(counters)),
    errorRate: round(errorRate(counters)),
    toolEfficiency: round(toolEfficiency(counters)),

    recoveryRate: round(behavior.recoveryRate),
    repetitionRate: round(behavior.repetitionRate),
    correctionLoopRate: round(behavior.correctionLoopRate),
    // Goal adherence needs the goal-drift detector, which is Phase 5. Null is
    // the honest value until then - it is never defaulted to 1 ("perfectly on
    // task") or 0 ("completely adrift").
    goalAdherence: null,

    tokens: context.tokens,
    context,
    contextPressure: round(context.utilization),
    cost,

    durationMs: computeDurationMs(events),
    unresolvedToolCalls: counters.unresolvedToolCalls,
  };
}

/**
 * Projects computed metrics onto the persisted snapshot shape.
 *
 * Scores are left out: this package measures, it does not score. Phase 5 fills
 * `healthScore`, `learningScore` and `degradationScore`.
 */
export function toSnapshot(sessionId: string, metrics: SessionMetrics): MetricsSnapshotCreate {
  return {
    sessionId,
    healthScore: null,
    learningScore: null,
    degradationScore: null,
    successRate: metrics.successRate,
    errorRate: metrics.errorRate,
    recoveryRate: metrics.recoveryRate,
    repetitionRate: metrics.repetitionRate,
    correctionLoopRate: metrics.correctionLoopRate,
    toolEfficiency: metrics.toolEfficiency,
    contextPressure: metrics.contextPressure,
  };
}
