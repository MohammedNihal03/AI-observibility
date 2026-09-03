import {
  DEFAULT_SCORING_CONFIG,
  validateScoringConfig,
  type ScoringConfig,
} from "@observatory/shared";
import { describe, expect, it } from "vitest";

import { computeDegradation } from "./degradation.js";
import { computeHealth } from "./health.js";
import { computeLearning } from "./learning.js";
import { EMPTY_CORRECTION_LOOPS } from "./recovery.js";
import { EMPTY_REPETITION } from "./repetition.js";
import { computeTrends, type TrendSet } from "./trends.js";
import type { WindowMetrics, WindowSet } from "./windows.js";

const window = (overrides: Partial<WindowMetrics>): WindowMetrics => ({
  label: "w",
  startIndex: 0,
  endIndex: 0,
  events: 10,
  actions: 5,
  successRate: null,
  errorRate: null,
  toolEfficiency: null,
  recoveryRate: null,
  repetitionRate: null,
  correctionLoopRate: null,
  goalAdherence: null,
  ...overrides,
});

const windowSet = (windows: readonly WindowMetrics[], totalActions = 30): WindowSet => ({
  windows,
  insufficient: false,
  totalActions,
});

describe("scoring configuration (section 20)", () => {
  it("ships a valid default", () => {
    expect(validateScoringConfig(DEFAULT_SCORING_CONFIG)).toEqual([]);
  });

  it("uses the weights the specification states", () => {
    expect(DEFAULT_SCORING_CONFIG.health.weights.recovery).toBe(0.3);
    expect(DEFAULT_SCORING_CONFIG.learning.weights.recoveryImprovement).toBe(0.25);
    expect(DEFAULT_SCORING_CONFIG.degradation.weights.repeatedFailedActions).toBe(0.3);
  });

  it("rejects weights that do not sum to 1", () => {
    const broken: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      health: {
        ...DEFAULT_SCORING_CONFIG.health,
        weights: { ...DEFAULT_SCORING_CONFIG.health.weights, recovery: 0.9 },
      },
    };
    const problems = validateScoringConfig(broken);
    expect(problems.some((problem) => problem.group === "health.weights")).toBe(true);
  });

  it("rejects bands that do not descend", () => {
    const broken: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      health: {
        ...DEFAULT_SCORING_CONFIG.health,
        bands: { healthy: 40, stable: 60, warning: 80 },
      },
    };
    expect(validateScoringConfig(broken).some((p) => p.group === "health.bands")).toBe(true);
  });
});

describe("health score (sections 25, 26)", () => {
  it("returns 100 when every component is perfect", () => {
    const health = computeHealth({
      recoveryRate: 1,
      toolEfficiency: 1,
      repetitionRate: 0,
      goalAdherence: 1,
      contextPressure: 0,
    });
    expect(health.score).toBe(100);
    expect(health.state).toBe("healthy");
  });

  it("returns 0 when every component is at its worst", () => {
    const health = computeHealth({
      recoveryRate: 0,
      toolEfficiency: 0,
      repetitionRate: 1,
      goalAdherence: 0,
      contextPressure: 1,
    });
    expect(health.score).toBe(0);
    expect(health.state).toBe("degrading");
  });

  it("maps scores to the specification's bands", () => {
    const at = (value: number): string =>
      computeHealth({
        recoveryRate: value,
        toolEfficiency: value,
        repetitionRate: 1 - value,
        goalAdherence: value,
        contextPressure: 1 - value,
      }).state;

    expect(at(0.9)).toBe("healthy");
    expect(at(0.7)).toBe("stable");
    expect(at(0.45)).toBe("warning");
    expect(at(0.2)).toBe("degrading");
  });

  it("excludes unmeasurable components instead of scoring them zero", () => {
    // A session that never failed has no recovery rate, and recovery is 30% of
    // the weighting. It must still be able to reach 100.
    const health = computeHealth({
      recoveryRate: null,
      toolEfficiency: 1,
      repetitionRate: 0,
      goalAdherence: null,
      contextPressure: 0,
    });
    expect(health.score).toBe(100);
    expect(health.measuredComponents).toBe(3);
  });

  it("renormalises the remaining weights to sum to 1", () => {
    const health = computeHealth({
      recoveryRate: null,
      toolEfficiency: 1,
      repetitionRate: 0,
      goalAdherence: null,
      contextPressure: 0,
    });
    const total = health.components.reduce((sum, part) => sum + part.effectiveWeight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("refuses to score when too little was measurable", () => {
    const health = computeHealth({
      recoveryRate: null,
      toolEfficiency: 1,
      repetitionRate: null,
      goalAdherence: null,
      contextPressure: null,
    });
    expect(health.score).toBeNull();
    expect(health.state).toBe("insufficient_data");
  });

  it("reports each component's contribution so the score can be explained", () => {
    const health = computeHealth({
      recoveryRate: 1,
      toolEfficiency: 0.5,
      repetitionRate: 0.5,
      goalAdherence: null,
      contextPressure: 0,
    });
    const recovery = health.components.find((part) => part.name === "recovery");
    expect(recovery?.contribution).toBeGreaterThan(0);
    expect(health.score).toBe(
      Math.round(health.components.reduce((sum, part) => sum + part.contribution, 0)),
    );
  });
});

describe("learning score (sections 19, 20, 22)", () => {
  const improving = computeTrends([
    window({ errorRate: 0.6, recoveryRate: 0.2, repetitionRate: 0.5, toolEfficiency: 0.4 }),
    window({ errorRate: 0.4, recoveryRate: 0.5, repetitionRate: 0.3, toolEfficiency: 0.6 }),
    window({ errorRate: 0.1, recoveryRate: 0.9, repetitionRate: 0.1, toolEfficiency: 0.9 }),
  ]);

  const degrading = computeTrends([
    window({ errorRate: 0.1, recoveryRate: 0.9, repetitionRate: 0.1, toolEfficiency: 0.9 }),
    window({ errorRate: 0.4, recoveryRate: 0.5, repetitionRate: 0.3, toolEfficiency: 0.6 }),
    window({ errorRate: 0.8, recoveryRate: 0.1, repetitionRate: 0.6, toolEfficiency: 0.3 }),
  ]);

  const flat = computeTrends([
    window({ errorRate: 0.3, recoveryRate: 0.6, repetitionRate: 0.2, toolEfficiency: 0.7 }),
    window({ errorRate: 0.3, recoveryRate: 0.6, repetitionRate: 0.2, toolEfficiency: 0.7 }),
    window({ errorRate: 0.3, recoveryRate: 0.6, repetitionRate: 0.2, toolEfficiency: 0.7 }),
  ]);

  it("refuses to classify without windows, however good the trends look", () => {
    const learning = computeLearning(improving, windowSet([]), DEFAULT_SCORING_CONFIG);
    expect(learning.state).toBe("insufficient_data");
    expect(learning.insufficientReason).toContain("rolling windows");
  });

  it("scores an improving session above 50", () => {
    const set = windowSet([window({}), window({}), window({})]);
    const learning = computeLearning(improving, set);
    expect(learning.state).toBe("improving");
    expect(learning.score).toBeGreaterThan(50);
  });

  it("scores a degrading session below 50", () => {
    const set = windowSet([window({}), window({}), window({})]);
    const learning = computeLearning(degrading, set);
    expect(learning.state).toBe("degrading");
    expect(learning.score).toBeLessThan(50);
  });

  it("scores an unchanged session at exactly 50 and calls it STABLE", () => {
    const set = windowSet([window({}), window({}), window({})]);
    const learning = computeLearning(flat, set);
    expect(learning.state).toBe("stable");
    expect(learning.score).toBe(50);
    expect(learning.weightedImprovement).toBe(0);
  });

  it("does not classify a session with too few actions (section 22)", () => {
    const set = windowSet([window({}), window({}), window({})], 3);
    const learning = computeLearning(improving, set);
    expect(learning.state).toBe("insufficient_data");
    expect(learning.score).toBeNull();
    expect(learning.insufficientReason).toContain("fewer than");
  });

  it("does not classify when a window is too thin", () => {
    const set: WindowSet = {
      windows: [window({ actions: 1 }), window({}), window({})],
      insufficient: true,
      totalActions: 30,
    };
    expect(computeLearning(improving, set).state).toBe("insufficient_data");
  });

  it("sign-corrects so a falling error rate counts as improvement", () => {
    const set = windowSet([window({}), window({}), window({})]);
    const learning = computeLearning(improving, set);
    const errorComponent = learning.components.find((part) => part.name === "errorReduction");
    expect(errorComponent?.improvement).toBeGreaterThan(0);
  });

  it("renormalises over the components that were measurable", () => {
    const partial = computeTrends([
      window({ errorRate: 0.6 }),
      window({ errorRate: 0.3 }),
      window({ errorRate: 0.1 }),
    ]);
    const set = windowSet([window({}), window({}), window({})]);
    const learning = computeLearning(partial, set);
    expect(learning.measuredComponents).toBe(1);
    const total = learning.components.reduce((sum, part) => sum + part.effectiveWeight, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("degradation score (sections 23, 24)", () => {
  const flatTrends: TrendSet = computeTrends([
    window({ errorRate: 0.2, recoveryRate: 0.8, repetitionRate: 0.1, toolEfficiency: 0.9 }),
    window({ errorRate: 0.2, recoveryRate: 0.8, repetitionRate: 0.1, toolEfficiency: 0.9 }),
  ]);

  it("reports no degradation for a steady session", () => {
    const result = computeDegradation({
      trends: flatTrends,
      repetition: EMPTY_REPETITION,
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: 0.2,
    });
    expect(result.score).toBe(0);
    expect(result.activeSignals).toEqual([]);
  });

  it("raises the repeated-failure signal at three in a row (section 16)", () => {
    const result = computeDegradation({
      trends: flatTrends,
      repetition: {
        ...EMPTY_REPETITION,
        longestConsecutiveFailureRun: 3,
        repeatedFailedActions: 2,
      },
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: 0.2,
    });
    const signal = result.signals.find((entry) => entry.name === "repeatedFailedActions");
    expect(signal?.severity).toBe(1);
    expect(signal?.evidence).toContain("3 times in a row");
    expect(result.score).toBeGreaterThan(0);
  });

  it("does not treat a single isolated failure as a repeated failure", () => {
    const result = computeDegradation({
      trends: flatTrends,
      repetition: {
        ...EMPTY_REPETITION,
        // One failure, never retried: a run of one is not a repetition.
        longestConsecutiveFailureRun: 1,
        repeatedFailedActions: 0,
      },
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: 0.2,
    });
    const signal = result.signals.find((entry) => entry.name === "repeatedFailedActions");
    expect(signal?.severity).toBe(0);
    expect(signal?.evidence).toBeNull();
    expect(result.score).toBe(0);
  });

  it("raises the repeated-failure signal at the second failure of one action", () => {
    const result = computeDegradation({
      trends: flatTrends,
      repetition: {
        ...EMPTY_REPETITION,
        longestConsecutiveFailureRun: 2,
        repeatedFailedActions: 1,
      },
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: 0.2,
    });
    const signal = result.signals.find((entry) => entry.name === "repeatedFailedActions");
    expect(signal?.severity).toBeCloseTo(2 / 3, 6);
    expect(signal?.evidence).toContain("2 times in a row");
  });

  it("gives repeated failures the largest single weight", () => {
    const weights = DEFAULT_SCORING_CONFIG.degradation.weights;
    const largest = Math.max(...Object.values(weights));
    expect(weights.repeatedFailedActions).toBe(largest);
  });

  it("treats a rising error rate as a signal", () => {
    const rising = computeTrends([window({ errorRate: 0.1 }), window({ errorRate: 0.6 })]);
    const result = computeDegradation({
      trends: rising,
      repetition: EMPTY_REPETITION,
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: null,
    });
    const signal = result.signals.find((entry) => entry.name === "increasingErrors");
    expect(signal?.severity).toBeCloseTo(0.5, 6);
  });

  it("treats a falling recovery rate as a signal", () => {
    const falling = computeTrends([window({ recoveryRate: 0.9 }), window({ recoveryRate: 0.2 })]);
    const result = computeDegradation({
      trends: falling,
      repetition: EMPTY_REPETITION,
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: null,
    });
    expect(result.signals.find((s) => s.name === "recoveryDecline")?.severity).toBeCloseTo(0.7, 6);
  });

  it("does not treat an improving error rate as degradation", () => {
    const falling = computeTrends([window({ errorRate: 0.6 }), window({ errorRate: 0.1 })]);
    const result = computeDegradation({
      trends: falling,
      repetition: EMPTY_REPETITION,
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: null,
    });
    expect(result.signals.find((s) => s.name === "increasingErrors")?.severity).toBe(0);
  });

  it("gives context pressure the smallest weight, because it is not a cause", () => {
    const weights = DEFAULT_SCORING_CONFIG.degradation.weights;
    const smallest = Math.min(...Object.values(weights));
    expect(weights.contextPressure).toBe(smallest);
  });

  it("ignores context below the warning threshold", () => {
    const result = computeDegradation({
      trends: flatTrends,
      repetition: EMPTY_REPETITION,
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: 0.5,
    });
    expect(result.signals.find((s) => s.name === "contextPressure")?.severity).toBe(0);
  });

  it("scales context pressure between the warning and critical thresholds", () => {
    const result = computeDegradation({
      trends: flatTrends,
      repetition: EMPTY_REPETITION,
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: 0.825,
    });
    expect(result.signals.find((s) => s.name === "contextPressure")?.severity).toBeCloseTo(0.5, 6);
  });

  it("states context as an observation, never as a cause", () => {
    const result = computeDegradation({
      trends: flatTrends,
      repetition: EMPTY_REPETITION,
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: 0.95,
    });
    const evidence = result.signals.find((s) => s.name === "contextPressure")?.evidence ?? "";
    expect(evidence).toMatch(/context utilization \d+%/);
    expect(evidence).not.toMatch(/caus|because|due to/i);
  });

  it("counts blind retries towards loop pressure", () => {
    const result = computeDegradation({
      trends: flatTrends,
      repetition: EMPTY_REPETITION,
      loops: { ...EMPTY_CORRECTION_LOOPS, blindRetries: 5 },
      contextPressure: null,
    });
    expect(result.signals.find((s) => s.name === "correctionLoops")?.severity).toBe(1);
  });

  it("exposes every individual signal (section 24)", () => {
    const result = computeDegradation({
      trends: flatTrends,
      repetition: EMPTY_REPETITION,
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: 0.2,
    });
    expect(result.signals).toHaveLength(6);
    for (const name of Object.keys(DEFAULT_SCORING_CONFIG.degradation.weights)) {
      expect(result.signals.some((signal) => signal.name === name)).toBe(true);
    }
  });

  it("returns null when nothing could be measured", () => {
    const empty = computeTrends([]);
    const result = computeDegradation({
      trends: empty,
      repetition: EMPTY_REPETITION,
      loops: EMPTY_CORRECTION_LOOPS,
      contextPressure: null,
    });
    // Repetition and loop signals are always measurable (they are counts), so
    // a score still exists; the trend-based ones are null.
    expect(result.signals.find((s) => s.name === "increasingErrors")?.severity).toBeNull();
    expect(result.score).toBe(0);
  });
});
