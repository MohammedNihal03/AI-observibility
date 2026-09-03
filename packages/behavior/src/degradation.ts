import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "@observatory/shared";

import type { CorrectionLoopResult } from "./recovery.js";
import type { RepetitionResult } from "./repetition.js";
import type { TrendSet } from "./trends.js";

/**
 * Degradation detection (BUILD.md sections 23, 24).
 *
 * The seven signals of section 23, each reduced to a 0-1 severity and combined
 * with the weights of section 24. 0 means no degradation detected, 100 severe.
 *
 * Two rules this module obeys strictly:
 *
 * 1. **Individual signals are exposed** (section 24). A degradation score with
 *    no breakdown is unactionable - "your agent is at 62" tells a developer
 *    nothing about what to do.
 * 2. **Context pressure is a signal, not a cause** (section 23). It carries the
 *    smallest weight, 5%, and its message says utilization is high. It never
 *    claims that context caused the degradation, because that is not something
 *    this data can show.
 */

export type DegradationSignalName = keyof ScoringConfig["degradation"]["weights"];

export interface DegradationSignal {
  readonly name: DegradationSignalName;
  /** 0-1. Null when the underlying metric was not measurable. */
  readonly severity: number | null;
  readonly weight: number;
  readonly effectiveWeight: number;
  /** The measurement behind the severity, for explanation and audit. */
  readonly evidence: string | null;
}

export interface DegradationResult {
  /** 0-100, or null when nothing could be measured. */
  readonly score: number | null;
  readonly signals: readonly DegradationSignal[];
  readonly measuredSignals: number;
  /** Signals at or above half severity, worst first. */
  readonly activeSignals: readonly DegradationSignal[];
}

export interface DegradationInputs {
  readonly trends: TrendSet;
  readonly repetition: RepetitionResult;
  readonly loops: CorrectionLoopResult;
  readonly contextPressure: number | null;
}

/** Positive part of a value: severity is never negative. */
const rise = (value: number | null): number | null =>
  value === null ? null : Math.min(1, Math.max(0, value));

export function computeDegradation(
  inputs: DegradationInputs,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): DegradationResult {
  const weights = config.degradation.weights;
  const { trends, repetition, loops } = inputs;

  // Section 23 signal 2, and section 16's core case: the same action failing
  // over and over. Severity saturates at the configured run length (3 by
  // default, matching section 16's worked example).
  //
  // A run of ONE is not a repetition: a single failed check is an ordinary
  // event, and this signal is about an action failing again. Counting it scored
  // a third of the heaviest degradation weight for any session containing one
  // isolated failure - a steady session with a single corrected failure read as
  // 11/100 degraded while its evidence line, which already required a run above
  // one, said nothing at all.
  const failureRun =
    repetition.longestConsecutiveFailureRun > 1 ? repetition.longestConsecutiveFailureRun : 0;
  const repeatedFailureSeverity =
    repetition.repeatedFailedActions === 0 && failureRun === 0
      ? 0
      : Math.min(
          1,
          Math.max(failureRun, repetition.repeatedFailedActions) /
            config.degradation.repeatedFailureSaturation,
        );

  // Signal 3. A rising number of correction loops means the agent keeps having
  // to fix its own work. Blind retries count double here: they are corrections
  // that corrected nothing.
  const loopPressure =
    loops.correctionLoops + loops.blindRetries === 0
      ? 0
      : Math.min(
          1,
          (loops.failedCorrectionLoops + loops.blindRetries) /
            config.degradation.correctionLoopSaturation,
        );

  const contextSeverity = ((): number | null => {
    if (inputs.contextPressure === null) return null;
    const { warningThreshold, criticalThreshold } = config.context;
    if (inputs.contextPressure <= warningThreshold) return 0;
    const span = criticalThreshold - warningThreshold;
    return Math.min(1, (inputs.contextPressure - warningThreshold) / span);
  })();

  const raw: readonly {
    name: DegradationSignalName;
    severity: number | null;
    weight: number;
    evidence: string | null;
  }[] = [
    {
      name: "repeatedFailedActions",
      severity: repeatedFailureSeverity,
      weight: weights.repeatedFailedActions,
      evidence:
        repetition.longestConsecutiveFailureRun > 1
          ? `an action failed ${repetition.longestConsecutiveFailureRun} times in a row`
          : repetition.repeatedFailedActions > 0
            ? `${repetition.repeatedFailedActions} repeated failed actions`
            : null,
    },
    {
      // Signal 1: increasing error rate.
      name: "increasingErrors",
      severity: rise(trends.errorRate.delta),
      weight: weights.increasingErrors,
      evidence:
        trends.errorRate.delta === null
          ? null
          : `error rate moved ${(trends.errorRate.delta * 100).toFixed(1)} points`,
    },
    {
      // Signal 4: declining recovery rate. A fall is a rise in severity.
      name: "recoveryDecline",
      severity: trends.recoveryRate.delta === null ? null : rise(-trends.recoveryRate.delta),
      weight: weights.recoveryDecline,
      evidence:
        trends.recoveryRate.delta === null
          ? null
          : `recovery rate moved ${(trends.recoveryRate.delta * 100).toFixed(1)} points`,
    },
    {
      name: "correctionLoops",
      severity: loopPressure,
      weight: weights.correctionLoops,
      evidence:
        loops.correctionLoops + loops.blindRetries > 0
          ? `${loops.correctionLoops} correction loops (${loops.failedCorrectionLoops} failed), ${loops.blindRetries} retries with no change`
          : null,
    },
    {
      // Signal 6: possible goal drift. Named "possible" on purpose - the
      // keyword detector is a lexical proxy, not a reading of intent.
      name: "goalDrift",
      severity: trends.goalAdherence.last === null ? null : rise(1 - trends.goalAdherence.last),
      weight: weights.goalDrift,
      evidence:
        trends.goalAdherence.last === null
          ? null
          : `${(trends.goalAdherence.last * 100).toFixed(0)}% of recent actions related to the stated goal`,
    },
    {
      // Signal 7. Smallest weight, and the message reports the observation
      // without asserting a cause.
      name: "contextPressure",
      severity: contextSeverity,
      weight: weights.contextPressure,
      evidence:
        inputs.contextPressure === null
          ? null
          : `context utilization ${(inputs.contextPressure * 100).toFixed(0)}%`,
    },
  ];

  const measured = raw.filter((signal) => signal.severity !== null);
  const totalWeight = measured.reduce((total, signal) => total + signal.weight, 0);

  if (measured.length === 0 || totalWeight <= 0) {
    return {
      score: null,
      signals: raw.map((signal) => ({ ...signal, effectiveWeight: 0 })),
      measuredSignals: 0,
      activeSignals: [],
    };
  }

  const signals: DegradationSignal[] = raw.map((signal) => ({
    ...signal,
    effectiveWeight: signal.severity === null ? 0 : signal.weight / totalWeight,
  }));

  const score = Math.round(
    Math.min(
      100,
      Math.max(
        0,
        signals.reduce(
          (total, signal) => total + (signal.severity ?? 0) * signal.effectiveWeight * 100,
          0,
        ),
      ),
    ),
  );

  const activeSignals = signals
    .filter((signal) => (signal.severity ?? 0) >= 0.5)
    .sort((a, b) => (b.severity ?? 0) * b.weight - (a.severity ?? 0) * a.weight);

  return { score, signals, measuredSignals: measured.length, activeSignals };
}
