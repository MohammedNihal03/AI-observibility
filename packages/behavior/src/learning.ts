import {
  DEFAULT_SCORING_CONFIG,
  type AgentState,
  type ScoringConfig,
} from "@observatory/shared";

import { improvementOf, type TrendMetric, type TrendSet } from "./trends.js";
import type { WindowSet } from "./windows.js";

/**
 * Behavioral learning (BUILD.md sections 19, 20, 22).
 *
 * ## What this is not
 *
 * Section 2, restated because it is the easiest thing in this product to
 * misrepresent: this score does NOT measure neural-network learning. No
 * weights change, no gradient is computed, no loss goes down. It measures
 * whether the agent's OBSERVABLE BEHAVIOR improved across the session - fewer
 * errors, better recovery, less repetition. Nothing more.
 *
 * ## Scale
 *
 * The five improvements are deltas in rate units, so each lands in [-1, 1].
 * The weighted sum is mapped onto 0-100 with 50 as "no change":
 *
 *   50   nothing moved            -> STABLE
 *   100  every metric improved maximally
 *   0    every metric regressed maximally
 *
 * 50 rather than 0 as the neutral point matters: a steady, competent session
 * that never had anything to improve is not a failing session, and scoring it 0
 * would say otherwise.
 */

export interface LearningComponent {
  readonly name: keyof ScoringConfig["learning"]["weights"];
  readonly metric: TrendMetric;
  /** Sign-corrected improvement: positive always means the agent got better. */
  readonly improvement: number | null;
  readonly weight: number;
  readonly effectiveWeight: number;
}

export interface LearningResult {
  /** 0-100, or null when the session cannot be classified yet. */
  readonly score: number | null;
  readonly state: AgentState;
  /** Weighted improvement in rate units, before the 0-100 mapping. */
  readonly weightedImprovement: number | null;
  readonly components: readonly LearningComponent[];
  readonly measuredComponents: number;
  /** Why the state is `insufficient_data`, when it is. */
  readonly insufficientReason: string | null;
}

const COMPONENT_METRICS: readonly {
  name: LearningComponent["name"];
  metric: TrendMetric;
}[] = [
  { name: "recoveryImprovement", metric: "recoveryRate" },
  { name: "errorReduction", metric: "errorRate" },
  { name: "repetitionReduction", metric: "repetitionRate" },
  { name: "goalAdherenceImprovement", metric: "goalAdherence" },
  { name: "toolEfficiencyImprovement", metric: "toolEfficiency" },
];

export function computeLearning(
  trends: TrendSet,
  windows: WindowSet,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): LearningResult {
  const weights = config.learning.weights;

  const raw = COMPONENT_METRICS.map((entry) => ({
    name: entry.name,
    metric: entry.metric,
    improvement: improvementOf(trends[entry.metric]),
    weight: weights[entry.name],
  }));

  const measured = raw.filter((component) => component.improvement !== null);

  // Section 22: do not classify a session after only one or two events.
  const tooFewObservations = windows.totalActions < config.learning.minObservations;
  const insufficientReason =
    windows.windows.length < 2
      ? "not enough actions to form rolling windows"
      : tooFewObservations
        ? `fewer than ${config.learning.minObservations} actions observed`
        : windows.insufficient
          ? "at least one window is too thin to measure"
          : measured.length === 0
            ? "no metric could be compared across windows"
            : null;

  if (insufficientReason !== null) {
    return {
      score: null,
      state: "insufficient_data",
      weightedImprovement: null,
      components: raw.map((component) => ({ ...component, effectiveWeight: 0 })),
      measuredComponents: measured.length,
      insufficientReason,
    };
  }

  const totalWeight = measured.reduce((total, component) => total + component.weight, 0);
  const components: LearningComponent[] = raw.map((component) => ({
    ...component,
    effectiveWeight: component.improvement === null ? 0 : component.weight / totalWeight,
  }));

  const weightedImprovement = components.reduce(
    (total, component) => total + (component.improvement ?? 0) * component.effectiveWeight,
    0,
  );

  const score = Math.round(Math.min(100, Math.max(0, 50 + 50 * weightedImprovement)));

  const state: AgentState =
    weightedImprovement > config.learning.improvingThreshold
      ? "improving"
      : weightedImprovement < config.learning.degradingThreshold
        ? "degrading"
        : "stable";

  return {
    score,
    state,
    weightedImprovement,
    components,
    measuredComponents: measured.length,
    insufficientReason: null,
  };
}
