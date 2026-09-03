import type { BehavioralCounts } from "@observatory/shared";

import type { CounterDetail } from "./counters.js";
import { rate } from "./ratio.js";

/**
 * Rate calculations (BUILD.md sections 12, 13, 15, 17, 18).
 *
 * Every function here is a ratio of two counts. The counts come from
 * `counters.ts` (measurable from single events) or from `packages/behavior`
 * (measurable only from sequences). This module never counts anything itself,
 * so there is exactly one definition of each quantity in the codebase.
 */

/**
 * Success rate (section 12): successful actions over total actions.
 *
 * Actions with an unreported outcome are excluded from BOTH sides rather than
 * counted as failures. An agent whose collector dropped a result did not fail -
 * we simply do not know, and `successRate + errorRate === 1` still holds over
 * the actions we do know about.
 */
export function successRate(counters: CounterDetail): number | null {
  return rate(counters.successfulOutcomes, counters.resolvedOutcomes);
}

/** Error rate: the complement of success over resolved outcomes. */
export function errorRate(counters: CounterDetail): number | null {
  return rate(counters.failedOutcomes, counters.resolvedOutcomes);
}

/**
 * Tool efficiency (section 13): successful tool calls over tool calls.
 *
 * The denominator is `toolResults`, not `totalToolCalls`. Section 13 writes the
 * formula as `successfulToolCalls / totalToolCalls`, and the numerator there is
 * derived from results, so the denominator has to be the same population or the
 * ratio is not a ratio. Dividing result-derived successes by invocation counts
 * produced 75/49 on a real session - clamped to a flattering 100% while eight
 * tool calls had actually failed.
 *
 * Invocations whose result never arrived are reported separately as
 * `unresolvedToolCalls` rather than folded in as failures. An agent whose
 * collector dropped a result did not fail; the telemetry has a gap, and the
 * dashboard should say which of the two it is.
 *
 * Deliberately kept naive otherwise. Section 13 says not to attempt
 * sophisticated productivity scoring in the MVP; a "was this call useful"
 * heuristic would be unfalsifiable and impossible to explain.
 */
export function toolEfficiency(counters: CounterDetail): number | null {
  return rate(counters.successfulToolCalls, counters.toolResults);
}

/**
 * Recovery rate (section 18): successful recoveries over total failures.
 *
 * A failure followed by investigation and a fix is healthy behavior, so this
 * rate is what keeps a single failure from denting the score - see the health
 * weighting in docs/scoring.md, where recovery carries the largest share.
 */
export function recoveryRate(
  counts: Pick<BehavioralCounts, "recoveries" | "failures">,
): number | null {
  return rate(counts.recoveries, counts.failures);
}

/**
 * Repetition rate (section 15): repeated actions over all actions.
 *
 * `repeatedActions` counts actions that were a repeat of something already
 * done, so the first occurrence is never counted - a session where every action
 * is distinct has a repetition rate of 0, not 1.
 */
export function repetitionRate(repeatedActions: number, totalActions: number): number | null {
  return rate(repeatedActions, totalActions);
}

/**
 * Correction-loop recovery (section 17): successful loops over all loops.
 *
 * Section 17's example: 5 correction loops, 4 successful, 80%. Note this is a
 * measure of how well corrections WORK, so a high value is good - unlike the
 * loop count itself, where a rising number is a degradation signal (section 23).
 */
export function correctionLoopRate(
  counts: Pick<BehavioralCounts, "correctionLoops" | "successfulCorrectionLoops">,
): number | null {
  return rate(counts.successfulCorrectionLoops, counts.correctionLoops);
}

/** All the behaviour-derived rates in one call, for the snapshot builder. */
export function behavioralRates(
  counts: BehavioralCounts,
  totalActions: number,
): {
  recoveryRate: number | null;
  repetitionRate: number | null;
  correctionLoopRate: number | null;
} {
  return {
    recoveryRate: recoveryRate(counts),
    repetitionRate: repetitionRate(counts.repeatedActions, totalActions),
    correctionLoopRate: correctionLoopRate(counts),
  };
}
