import { z } from "zod";

import { isoTimestampSchema } from "./events.js";
import type { SessionCounters } from "./session.js";

/**
 * The persisted metrics snapshot (BUILD.md section 51).
 *
 * One row per recalculation, so the dashboard can chart a score over the
 * session (section 36, "Agent health over session steps") rather than only
 * showing the latest value.
 *
 * Every field is nullable. A snapshot taken three events into a session has no
 * meaningful recovery rate, and null is the honest representation of that -
 * writing 0 would render as "0% recovery", which is a different and false
 * claim (sections 22, 27).
 *
 * The computation itself lands in Phase 4 (rates) and Phase 5 (scores). This
 * module only fixes the shape both sides agree on.
 */

const nonEmptyString = z.string().min(1);
const score = z.number().min(0).max(100).nullable();
const rate = z.number().min(0).max(1).nullable();

export const metricsSnapshotSchema = z.object({
  id: nonEmptyString,
  sessionId: nonEmptyString,
  timestamp: isoTimestampSchema,

  /** 0-100. See docs/scoring.md - these are product bands, not measurements. */
  healthScore: score,
  /** 0-100 behavioral learning. NOT neural-network learning (section 2). */
  learningScore: score,
  /** 0-100, where 0 is no degradation detected (section 24). */
  degradationScore: score,

  successRate: rate,
  errorRate: rate,
  recoveryRate: rate,
  repetitionRate: rate,
  correctionLoopRate: rate,
  toolEfficiency: rate,
  /**
   * Tokens used over the context maximum, 0-1.
   *
   * Null when the provider does not report a maximum and none is configured.
   * A maximum is never invented to produce a percentage (section 29).
   */
  contextPressure: rate,
});
export type MetricsSnapshot = z.infer<typeof metricsSnapshotSchema>;

export const metricsSnapshotCreateSchema = metricsSnapshotSchema
  .omit({ id: true, timestamp: true })
  .extend({
    id: nonEmptyString.optional(),
    timestamp: isoTimestampSchema.optional(),
    healthScore: score.optional(),
    learningScore: score.optional(),
    degradationScore: score.optional(),
    successRate: rate.optional(),
    errorRate: rate.optional(),
    recoveryRate: rate.optional(),
    repetitionRate: rate.optional(),
    correctionLoopRate: rate.optional(),
    toolEfficiency: rate.optional(),
    contextPressure: rate.optional(),
  });
export type MetricsSnapshotCreate = z.infer<typeof metricsSnapshotCreateSchema>;

/**
 * Token totals for a session (section 30).
 *
 * `cached` is counted separately rather than folded into `input`, because
 * cached input is priced differently and because a high cache-read ratio is a
 * sign of a long session, not of heavy work.
 */
export interface TokenUsage {
  readonly input: number;
  readonly output: number;
  readonly cached: number;
  /** input + output + cached. */
  readonly total: number;
}

/** Where a context-window maximum came from. Never "we assumed". */
export const MAXIMUM_SOURCES = ["reported", "configured", "unknown"] as const;
export type MaximumSource = (typeof MAXIMUM_SOURCES)[number];

/**
 * Context utilization (section 29).
 *
 * `utilization` is null whenever `maximum` is null. The specification is
 * explicit: if the context limit is unknown, show usage and say the maximum is
 * unknown. Do not invent a maximum.
 */
export interface ContextUsage {
  readonly tokens: TokenUsage;
  /** Tokens currently occupying the context window, as last reported. */
  readonly used: number;
  readonly maximum: number | null;
  readonly maximumSource: MaximumSource;
  /** used / maximum, 0-1. Null when the maximum is unknown. */
  readonly utilization: number | null;
}

/** Per-model pricing, supplied by configuration. Never shipped as a default. */
export interface ModelPricing {
  readonly inputPerMillionUsd: number;
  readonly outputPerMillionUsd: number;
  readonly cachedInputPerMillionUsd?: number;
}

export type PricingRegistry = Readonly<Record<string, ModelPricing>>;

export const COST_SOURCES = ["reported", "estimated", "unavailable"] as const;
export type CostSource = (typeof COST_SOURCES)[number];

/**
 * A session's cost (section 30).
 *
 * `reported`    the agent told us (Claude Code records real spend).
 * `estimated`   computed from configured pricing.
 * `unavailable` no reported figure and no pricing - amount is null and the UI
 *               must render "Cost unavailable" rather than a guess.
 */
export interface CostEstimate {
  readonly amountUsd: number | null;
  readonly source: CostSource;
}

/**
 * Counts that require behavioral detection to produce (Phase 5).
 *
 * The metrics engine turns these into rates but does not find them: pairing a
 * failure with its recovery, or recognizing an edit/test/edit/test loop, is
 * sequence analysis and belongs in `packages/behavior`.
 */
export interface BehavioralCounts {
  readonly failures: number;
  readonly recoveries: number;
  readonly repeatedActions: number;
  readonly repeatedFailedActions: number;
  readonly correctionLoops: number;
  readonly successfulCorrectionLoops: number;
}

/**
 * The full computed metric set for a session (section 11).
 *
 * Every rate is `number | null`, and null always means "not measurable yet",
 * never zero. A session with no finished tool calls has no success rate;
 * reporting 0% would assert that everything failed.
 */
export interface SessionMetrics {
  readonly counters: SessionCounters;

  /** successfulOutcomes / resolvedOutcomes (section 12). */
  readonly successRate: number | null;
  /** failedOutcomes / resolvedOutcomes. */
  readonly errorRate: number | null;
  /** successfulToolCalls / totalToolCalls (section 13). */
  readonly toolEfficiency: number | null;

  /** Recoveries over failures (section 18). Null until Phase 5 supplies counts. */
  readonly recoveryRate: number | null;
  /** Repeated actions over total actions (section 15). */
  readonly repetitionRate: number | null;
  /** Successful correction loops over all correction loops (section 17). */
  readonly correctionLoopRate: number | null;
  /** Null until goal-drift detection exists (section 28). */
  readonly goalAdherence: number | null;

  readonly tokens: TokenUsage;
  readonly context: ContextUsage;
  /** Alias of `context.utilization`, the name used by the metrics table. */
  readonly contextPressure: number | null;
  readonly cost: CostEstimate;

  readonly durationMs: number | null;
  /**
   * Tool calls whose outcome was never reported. Exposed rather than hidden:
   * the specification's tool-efficiency formula divides by ALL tool calls, so a
   * collector that drops results makes the agent look worse than it was, and
   * the dashboard needs to be able to say so.
   */
  readonly unresolvedToolCalls: number;
}

/** An empty snapshot: nothing computed yet, and honest about it. */
export const EMPTY_METRICS: Omit<MetricsSnapshot, "id" | "sessionId" | "timestamp"> = {
  healthScore: null,
  learningScore: null,
  degradationScore: null,
  successRate: null,
  errorRate: null,
  recoveryRate: null,
  repetitionRate: null,
  correctionLoopRate: null,
  toolEfficiency: null,
  contextPressure: null,
};
