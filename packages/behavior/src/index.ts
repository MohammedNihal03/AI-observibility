/**
 * @observatory/behavior
 *
 * Behavioral analysis over normalized events (BUILD.md sections 15-28).
 *
 * IMPORTANT NAMING RULE (section 2): nothing in this package measures
 * neural-network learning. There are no gradients, no weights, no loss. The
 * "learning score" here is BEHAVIORAL learning - whether the agent's observable
 * behavior improved within a session. Never label it as model learning.
 *
 * Every export is a pure function. Order-sensitive by design: recovery and
 * correction loops are properties of a sequence, not of individual events.
 */

export const PACKAGE_NAME = "@observatory/behavior" as const;

export { analyzeSession, signalsFor, toMetricsSnapshot } from "./analyze.js";
export type { AnalyzeOptions, BehaviorAnalysis } from "./analyze.js";

export { actionsOf, isModification, pairActionsWithOutcomes } from "./pairing.js";
export type { ActionOutcome, PairingResult, PairingStrategy } from "./pairing.js";

export { detectRepetition, EMPTY_REPETITION } from "./repetition.js";
export type { RepeatedSignature, RepetitionResult } from "./repetition.js";

export { analyzeRecovery, EMPTY_CORRECTION_LOOPS, EMPTY_RECOVERY } from "./recovery.js";
export type { CorrectionLoopResult, FailureEpisode, RecoveryResult } from "./recovery.js";

export { computeWindows, measureWindow, splitIntoWindows } from "./windows.js";
export type { WindowMetrics, WindowOptions, WindowSet } from "./windows.js";

export { computeTrend, computeTrends, improvementOf, isLowerBetter, TREND_METRICS } from "./trends.js";
export type { Trend, TrendMetric, TrendSet } from "./trends.js";

export { computeHealth } from "./health.js";
export type { HealthComponent, HealthInputs, HealthResult } from "./health.js";

export { computeLearning } from "./learning.js";
export type { LearningComponent, LearningResult } from "./learning.js";

export { computeDegradation } from "./degradation.js";
export type {
  DegradationInputs,
  DegradationResult,
  DegradationSignal,
  DegradationSignalName,
} from "./degradation.js";

export {
  createKeywordGoalDriftDetector,
  extractKeywords,
  NULL_GOAL_DRIFT_DETECTOR,
} from "./goal-drift.js";
export type { GoalDriftDetector, SessionGoal } from "./goal-drift.js";

export { describeChange, deriveSignals, explainState } from "./explain.js";
export type { ExplainInputs } from "./explain.js";
