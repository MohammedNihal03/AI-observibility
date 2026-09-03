/**
 * The single scoring configuration (BUILD.md sections 20, 22, 24, 25, 26).
 *
 * Section 20 is explicit: "Make weights configurable. Do not hard-code them
 * throughout the application. Put scoring configuration in one place." This is
 * that place. No weight, threshold or band appears anywhere else in the
 * codebase - retuning the product means editing this file, not grepping for
 * magic numbers.
 *
 * Everything here is a PRODUCT DECISION, not a measurement. See docs/scoring.md.
 */

/** Health bands (section 26). Product thresholds, not science. */
export const HEALTH_STATES = ["healthy", "stable", "warning", "degrading"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export interface HealthWeights {
  readonly recovery: number;
  readonly toolEfficiency: number;
  readonly repetitionAvoidance: number;
  readonly goalAdherence: number;
  readonly contextManagement: number;
}

export interface LearningWeights {
  readonly recoveryImprovement: number;
  readonly errorReduction: number;
  readonly repetitionReduction: number;
  readonly goalAdherenceImprovement: number;
  readonly toolEfficiencyImprovement: number;
}

export interface DegradationWeights {
  readonly repeatedFailedActions: number;
  readonly increasingErrors: number;
  readonly recoveryDecline: number;
  readonly correctionLoops: number;
  readonly goalDrift: number;
  readonly contextPressure: number;
}

export interface ScoringConfig {
  readonly health: {
    readonly weights: HealthWeights;
    /** Lower bound of each band, descending (section 26). */
    readonly bands: { readonly healthy: number; readonly stable: number; readonly warning: number };
    /** Fewest measurable components before a score is produced at all. */
    readonly minComponents: number;
  };

  readonly learning: {
    readonly weights: LearningWeights;
    /**
     * Weighted improvement above which a session is IMPROVING and below whose
     * negation it is DEGRADING (section 22). Deliberately not zero: every
     * session wobbles, and calling a 1% drift "degrading" would make the label
     * meaningless.
     */
    readonly improvingThreshold: number;
    readonly degradingThreshold: number;
    /**
     * Minimum action events before a session is classified at all (section 22:
     * "Do not classify a session after only one or two events").
     */
    readonly minObservations: number;
  };

  readonly degradation: {
    readonly weights: DegradationWeights;
    /**
     * Repeated failures at which that signal reaches full severity. Three is
     * section 16's worked example: npm test failing three times in a row.
     */
    readonly repeatedFailureSaturation: number;
    /** Correction loops at which that signal reaches full severity. */
    readonly correctionLoopSaturation: number;
  };

  readonly repetition: {
    /** Occurrences of one signature before it counts as repetition. */
    readonly minOccurrences: number;
    /**
     * Consecutive failures of the same action before a signal is raised.
     * Section 16: one failure is not necessarily bad, three in a row is.
     */
    readonly consecutiveFailureThreshold: number;
  };

  readonly windows: {
    /** Rolling windows to split a session into (section 21: early/middle/recent). */
    readonly count: number;
    /** Events each window needs before its metrics are trusted. */
    readonly minEventsPerWindow: number;
  };

  readonly context: {
    /** Utilization at which context pressure starts contributing (section 23). */
    readonly warningThreshold: number;
    readonly criticalThreshold: number;
  };

  readonly explain: {
    /**
     * Smallest change worth putting in front of a user. Below this a metric
     * moved but the movement is noise, and reporting it would pad the
     * explanation with things that do not matter (section 27).
     */
    readonly minReportableDelta: number;
    readonly maxReasons: number;
  };
}

/**
 * Default configuration.
 *
 * The weights come straight from BUILD.md sections 20, 24 and 25. Each group
 * sums to 1; `assertValidScoringConfig` enforces that.
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  health: {
    // Section 25. Recovery carries the most because adapting to a failure is
    // the behavior that most distinguishes a healthy agent from a stuck one.
    weights: {
      recovery: 0.3,
      toolEfficiency: 0.2,
      repetitionAvoidance: 0.2,
      goalAdherence: 0.15,
      contextManagement: 0.15,
    },
    bands: { healthy: 80, stable: 60, warning: 40 },
    minComponents: 2,
  },

  learning: {
    // Section 20.
    weights: {
      recoveryImprovement: 0.25,
      errorReduction: 0.2,
      repetitionReduction: 0.2,
      goalAdherenceImprovement: 0.2,
      toolEfficiencyImprovement: 0.15,
    },
    improvingThreshold: 0.05,
    degradingThreshold: -0.05,
    minObservations: 8,
  },

  degradation: {
    // Section 24.
    weights: {
      repeatedFailedActions: 0.3,
      increasingErrors: 0.2,
      recoveryDecline: 0.2,
      correctionLoops: 0.15,
      goalDrift: 0.1,
      contextPressure: 0.05,
    },
    repeatedFailureSaturation: 3,
    correctionLoopSaturation: 5,
  },

  repetition: {
    minOccurrences: 2,
    consecutiveFailureThreshold: 3,
  },

  windows: {
    count: 3,
    minEventsPerWindow: 3,
  },

  context: {
    warningThreshold: 0.75,
    criticalThreshold: 0.9,
  },

  explain: {
    minReportableDelta: 0.05,
    maxReasons: 6,
  },
};

const WEIGHT_SUM_TOLERANCE = 1e-9;

/** Any of the weight groups, viewed as a plain name-to-number map. */
type WeightGroup = HealthWeights | LearningWeights | DegradationWeights;

function entriesOf(weights: WeightGroup): readonly [string, number][] {
  return Object.entries(weights) as [string, number][];
}

function sum(weights: WeightGroup): number {
  return entriesOf(weights).reduce((total, [, weight]) => total + weight, 0);
}

export interface ScoringConfigProblem {
  readonly group: string;
  readonly message: string;
}

/**
 * Checks a configuration for internal consistency.
 *
 * Weights that do not sum to 1 produce scores that cannot reach 100, which
 * looks like a broken agent rather than a broken config. Catching it here means
 * a typo in a weight fails loudly instead of skewing every score quietly.
 */
export function validateScoringConfig(config: ScoringConfig): readonly ScoringConfigProblem[] {
  const problems: ScoringConfigProblem[] = [];

  const groups: readonly [string, WeightGroup][] = [
    ["health.weights", config.health.weights],
    ["learning.weights", config.learning.weights],
    ["degradation.weights", config.degradation.weights],
  ];

  for (const [group, weights] of groups) {
    const total = sum(weights);
    if (Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE) {
      problems.push({ group, message: `weights must sum to 1, got ${total}` });
    }
    for (const [name, weight] of entriesOf(weights)) {
      if (weight < 0) problems.push({ group, message: `${name} must not be negative` });
    }
  }

  const { healthy, stable, warning } = config.health.bands;
  if (!(healthy > stable && stable > warning)) {
    problems.push({
      group: "health.bands",
      message: "bands must descend: healthy > stable > warning",
    });
  }

  if (config.learning.improvingThreshold <= 0) {
    problems.push({ group: "learning", message: "improvingThreshold must be positive" });
  }
  if (config.learning.degradingThreshold >= 0) {
    problems.push({ group: "learning", message: "degradingThreshold must be negative" });
  }
  if (config.windows.count < 2) {
    problems.push({ group: "windows", message: "at least two windows are needed for a trend" });
  }
  if (config.context.warningThreshold >= config.context.criticalThreshold) {
    problems.push({
      group: "context",
      message: "warningThreshold must be below criticalThreshold",
    });
  }

  return problems;
}

export function assertValidScoringConfig(config: ScoringConfig): void {
  const problems = validateScoringConfig(config);
  if (problems.length > 0) {
    const detail = problems.map((problem) => `${problem.group}: ${problem.message}`).join("; ");
    throw new Error(`Invalid scoring configuration - ${detail}`);
  }
}

/** Maps a 0-100 score to its band (section 26). */
export function healthStateFor(
  score: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): HealthState {
  const { healthy, stable, warning } = config.health.bands;
  if (score >= healthy) return "healthy";
  if (score >= stable) return "stable";
  if (score >= warning) return "warning";
  return "degrading";
}
