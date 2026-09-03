/**
 * @observatory/metrics
 *
 * Deterministic metric computation (BUILD.md sections 11-14, 29, 30).
 *
 * Every export is a PURE function of `AgentEvent[]` plus configuration. No
 * database access, no network access, no clock, no LLM (section 50). That is
 * what makes the analytics reproducible under a fixed seed (section 57) and
 * testable without a running server.
 *
 * PHASE 4 (current): counters, rates, tool efficiency, tokens, context, cost.
 * PHASE 5 adds nothing here - it supplies `BehavioralCounts` from
 *              `packages/behavior`, and the rate functions below turn them into
 *              recovery, repetition and correction-loop rates.
 */

export const PACKAGE_NAME = "@observatory/metrics" as const;

export { computeCounters, computeDurationMs, emptyCounters } from "./counters.js";
export type { CounterDetail } from "./counters.js";

export { rate, ratio, round, toPercent } from "./ratio.js";

export {
  behavioralRates,
  correctionLoopRate,
  errorRate,
  recoveryRate,
  repetitionRate,
  successRate,
  toolEfficiency,
} from "./rates.js";

export { computeContextUsage, computeCost, computeTokenUsage, resolvePricing } from "./tokens.js";
export type { ContextOptions, CostOptions } from "./tokens.js";

export { computeSessionMetrics, countActions, toSnapshot } from "./session.js";
export type { SessionMetricsOptions } from "./session.js";
