import {
  DEFAULT_SCORING_CONFIG,
  type AgentState,
  type BehavioralCounts,
  type HealthState,
  type MetricsSnapshotCreate,
  type NormalizedAgentEvent,
  type Reason,
  type ScoringConfig,
  type SessionMetrics,
  type SignalCreate,
} from "@observatory/shared";
import { computeSessionMetrics, type SessionMetricsOptions } from "@observatory/metrics";

import { computeDegradation, type DegradationResult } from "./degradation.js";
import { deriveSignals, explainState } from "./explain.js";
import {
  createKeywordGoalDriftDetector,
  NULL_GOAL_DRIFT_DETECTOR,
  type GoalDriftDetector,
  type SessionGoal,
} from "./goal-drift.js";
import { computeHealth, type HealthResult } from "./health.js";
import { computeLearning, type LearningResult } from "./learning.js";
import { pairActionsWithOutcomes, type PairingResult } from "./pairing.js";
import {
  analyzeRecovery,
  type CorrectionLoopResult,
  type RecoveryResult,
} from "./recovery.js";
import { detectRepetition, type RepetitionResult } from "./repetition.js";
import { computeTrends, type TrendSet } from "./trends.js";
import { computeWindows, type WindowSet } from "./windows.js";

/**
 * The behavioral engine entry point (BUILD.md Phase 5).
 *
 * One pure function over an ordered event list. Deterministic, no I/O, no
 * clock, no LLM (sections 50, 57). Order matters here in a way it does not for
 * the metrics engine: recovery and correction loops are sequence properties, so
 * events must arrive in the order they happened - which is what the store's
 * (timestamp, sequence) ordering guarantees.
 */

export interface AnalyzeOptions {
  readonly config?: ScoringConfig;
  readonly goal?: SessionGoal;
  readonly goalDriftDetector?: GoalDriftDetector;
  readonly metrics?: SessionMetricsOptions;
}

export interface BehaviorAnalysis {
  readonly counts: BehavioralCounts;
  readonly pairing: PairingResult;
  readonly repetition: RepetitionResult;
  readonly recovery: RecoveryResult;
  readonly loops: CorrectionLoopResult;
  readonly windows: WindowSet;
  readonly trends: TrendSet;
  readonly health: HealthResult;
  readonly learning: LearningResult;
  readonly degradation: DegradationResult;
  /** Metrics with the behaviour-derived rates filled in. */
  readonly metrics: SessionMetrics;
  readonly goalAdherence: number | null;
  readonly reasons: readonly Reason[];
  readonly signals: readonly SignalCreate[];
  /** The session's headline state, from the learning trend (section 9). */
  readonly currentState: AgentState;
  readonly healthState: HealthState | "insufficient_data";
}

export function analyzeSession(
  events: readonly NormalizedAgentEvent[],
  options: AnalyzeOptions = {},
): BehaviorAnalysis {
  const config = options.config ?? DEFAULT_SCORING_CONFIG;

  const goal = options.goal;
  const detector =
    options.goalDriftDetector ??
    (goal !== undefined ? createKeywordGoalDriftDetector() : NULL_GOAL_DRIFT_DETECTOR);

  const goalAdherenceFor = (slice: readonly NormalizedAgentEvent[]): number | null =>
    goal === undefined ? null : detector.measureAdherence(slice, goal);

  const pairing = pairActionsWithOutcomes(events);
  const repetition = detectRepetition(pairing.pairs, config);
  const { recovery, loops } = analyzeRecovery(events, pairing.pairs);
  const goalAdherence = goalAdherenceFor(events);

  const counts: BehavioralCounts = {
    failures: recovery.failures,
    recoveries: recovery.recoveries,
    repeatedActions: repetition.repeatedActions,
    repeatedFailedActions: repetition.repeatedFailedActions,
    correctionLoops: loops.correctionLoops,
    successfulCorrectionLoops: loops.successfulCorrectionLoops,
    measurableActions: repetition.totalActions,
  };

  // Metrics are computed with the behavioural counts folded in, so the rates
  // this package produces and the ones the metrics package reports are the same
  // numbers rather than two parallel calculations.
  const baseMetrics = computeSessionMetrics(events, { ...options.metrics, behavior: counts });
  const metrics: SessionMetrics = { ...baseMetrics, goalAdherence };

  const windows = computeWindows(events, { config, goalAdherenceFor });
  const trends = computeTrends(windows.windows);

  const health = computeHealth(
    {
      recoveryRate: metrics.recoveryRate,
      toolEfficiency: metrics.toolEfficiency,
      repetitionRate: metrics.repetitionRate,
      goalAdherence,
      contextPressure: metrics.contextPressure,
    },
    config,
  );

  const learning = computeLearning(trends, windows, config);

  const degradation = computeDegradation(
    { trends, repetition, loops, contextPressure: metrics.contextPressure },
    config,
  );

  const explainInputs = {
    trends,
    health,
    learning,
    degradation,
    repetition,
    recovery,
    loops,
    contextPressure: metrics.contextPressure,
  };

  return {
    counts,
    pairing,
    repetition,
    recovery,
    loops,
    windows,
    trends,
    health,
    learning,
    degradation,
    metrics,
    goalAdherence,
    reasons: explainState(explainInputs, config),
    signals: deriveSignals("", explainInputs, config),
    currentState: learning.state,
    healthState: health.state,
  };
}

/** Signals for a specific session id, ready to persist. */
export function signalsFor(
  sessionId: string,
  analysis: BehaviorAnalysis,
): readonly SignalCreate[] {
  return analysis.signals.map((signal) => ({ ...signal, sessionId }));
}

/** Projects an analysis onto the persisted metrics snapshot (section 51). */
export function toMetricsSnapshot(
  sessionId: string,
  analysis: BehaviorAnalysis,
): MetricsSnapshotCreate {
  return {
    sessionId,
    healthScore: analysis.health.score,
    learningScore: analysis.learning.score,
    degradationScore: analysis.degradation.score,
    successRate: analysis.metrics.successRate,
    errorRate: analysis.metrics.errorRate,
    recoveryRate: analysis.metrics.recoveryRate,
    repetitionRate: analysis.metrics.repetitionRate,
    correctionLoopRate: analysis.metrics.correctionLoopRate,
    toolEfficiency: analysis.metrics.toolEfficiency,
    contextPressure: analysis.metrics.contextPressure,
  };
}
