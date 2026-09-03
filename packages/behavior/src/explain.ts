import {
  DEFAULT_SCORING_CONFIG,
  type Reason,
  type ScoringConfig,
  type SignalCreate,
  type SignalSeverity,
} from "@observatory/shared";

import type { DegradationResult } from "./degradation.js";
import type { HealthResult } from "./health.js";
import type { LearningResult } from "./learning.js";
import type { CorrectionLoopResult, RecoveryResult } from "./recovery.js";
import type { RepetitionResult } from "./repetition.js";
import type { Trend, TrendMetric, TrendSet } from "./trends.js";
import { isLowerBetter } from "./trends.js";

/**
 * The explainability engine (BUILD.md section 27).
 *
 * "Every score must return reasons. Never show `Health = 62` without
 * explaining why. Reasons should be generated from actual metrics. Never
 * fabricate explanations."
 *
 * Every message in this file is built from a number that was measured. There
 * are no canned encouragements, no LLM-written prose, and no reason is emitted
 * when the corresponding metric did not move. If nothing measurable happened,
 * the list comes back empty and the dashboard says there is not enough data -
 * which is the honest thing to display.
 */

const METRIC_LABELS: Readonly<Record<TrendMetric, string>> = {
  successRate: "Success rate",
  errorRate: "Error rate",
  toolEfficiency: "Tool efficiency",
  recoveryRate: "Recovery rate",
  repetitionRate: "Repetition",
  correctionLoopRate: "Correction recovery",
  goalAdherence: "Goal adherence",
};

/**
 * Describes a change the way section 38's example does - "Error rate decreased
 * 42%" - preferring relative change when there is a non-zero baseline to be
 * relative to, and falling back to percentage points when there is not.
 */
export function describeChange(trend: Trend): { message: string; delta: number } | null {
  if (trend.delta === null || trend.delta === 0) return null;

  const label = METRIC_LABELS[trend.metric];
  const rose = trend.delta > 0;
  const verb = rose ? "increased" : "decreased";

  if (trend.relativeChange !== null && Math.abs(trend.relativeChange) >= 0.005) {
    const percent = Math.abs(trend.relativeChange * 100);
    return { message: `${label} ${verb} ${percent.toFixed(0)}%`, delta: trend.delta };
  }

  const points = Math.abs(trend.delta * 100);
  return { message: `${label} ${verb} ${points.toFixed(1)} points`, delta: trend.delta };
}

function reasonFor(trend: Trend, config: ScoringConfig): Reason | null {
  if (trend.delta === null) return null;
  if (Math.abs(trend.delta) < config.explain.minReportableDelta) return null;

  const described = describeChange(trend);
  if (described === null) return null;

  const improved = isLowerBetter(trend.metric) ? trend.delta < 0 : trend.delta > 0;

  return {
    type: improved ? "positive" : "negative",
    message: described.message,
    metric: trend.metric,
    delta: described.delta,
  };
}

export interface ExplainInputs {
  readonly trends: TrendSet;
  readonly health: HealthResult;
  readonly learning: LearningResult;
  readonly degradation: DegradationResult;
  readonly repetition: RepetitionResult;
  readonly recovery: RecoveryResult;
  readonly loops: CorrectionLoopResult;
  readonly contextPressure: number | null;
}

/**
 * Reasons behind the current state, strongest first.
 *
 * Ordered by the size of the measured change rather than by whether the news is
 * good, so a session that improved in four ways and regressed badly in one does
 * not bury the regression.
 */
export function explainState(
  inputs: ExplainInputs,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): readonly Reason[] {
  const reasons: Reason[] = [];

  for (const trend of Object.values(inputs.trends)) {
    const reason = reasonFor(trend, config);
    if (reason !== null) reasons.push(reason);
  }

  // Counts that are not trends but matter more than any of them.
  if (inputs.repetition.longestConsecutiveFailureRun >= config.repetition.consecutiveFailureThreshold) {
    const worst = inputs.repetition.repeatedSignatures[0];
    reasons.unshift({
      type: "negative",
      message:
        `The same action failed ${inputs.repetition.longestConsecutiveFailureRun} times in a row` +
        (worst !== undefined ? ` (${shortSignature(worst.signature)})` : ""),
      metric: "repeatedFailedActions",
      delta: inputs.repetition.longestConsecutiveFailureRun,
    });
  }

  if (inputs.loops.blindRetries > 0) {
    reasons.push({
      type: "warning",
      message: `${inputs.loops.blindRetries} ${plural(inputs.loops.blindRetries, "retry", "retries")} with no change in between`,
      metric: "blindRetries",
      delta: inputs.loops.blindRetries,
    });
  }

  if (inputs.recovery.failures > 0 && inputs.recovery.recoveries === inputs.recovery.failures) {
    reasons.push({
      type: "positive",
      message: `Recovered from all ${inputs.recovery.failures} ${plural(inputs.recovery.failures, "failure", "failures")}`,
      metric: "recoveryRate",
    });
  }

  if (inputs.loops.successfulCorrectionLoops > 0) {
    reasons.push({
      type: "positive",
      message: `${inputs.loops.successfulCorrectionLoops} successful correction ${plural(inputs.loops.successfulCorrectionLoops, "loop", "loops")}`,
      metric: "correctionLoopRate",
      delta: inputs.loops.successfulCorrectionLoops,
    });
  }

  // Context is reported as an observation. It never says context caused
  // anything (section 23).
  if (inputs.contextPressure !== null && inputs.contextPressure >= config.context.warningThreshold) {
    reasons.push({
      type: "warning",
      message: `Context utilization is high (${Math.round(inputs.contextPressure * 100)}%)`,
      metric: "contextPressure",
      delta: inputs.contextPressure,
    });
  }

  if (inputs.learning.state === "insufficient_data" && inputs.learning.insufficientReason !== null) {
    reasons.push({
      type: "neutral",
      message: `Not enough data to judge a trend yet - ${inputs.learning.insufficientReason}`,
      metric: "observations",
    });
  }

  return dedupe(reasons)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
    .slice(0, config.explain.maxReasons);
}

/**
 * Signals worth persisting for the timeline (section 51).
 *
 * Only signals whose evidence exists are emitted, and each message repeats the
 * measurement it came from so a reader can check it.
 */
export function deriveSignals(
  sessionId: string,
  inputs: ExplainInputs,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): readonly SignalCreate[] {
  const signals: SignalCreate[] = [];

  for (const repeated of inputs.repetition.repeatedSignatures) {
    if (repeated.longestFailureRun >= config.repetition.consecutiveFailureThreshold) {
      signals.push({
        sessionId,
        type: "repeated_failed_action",
        severity: "critical",
        message: `${shortSignature(repeated.signature)} failed ${repeated.longestFailureRun} times in a row`,
        metadata: {
          signature: repeated.signature,
          occurrences: repeated.occurrences,
          failures: repeated.failures,
          longestFailureRun: repeated.longestFailureRun,
        },
      });
      continue;
    }
    if (repeated.occurrences > config.repetition.minOccurrences) {
      signals.push({
        sessionId,
        type: "repeated_action_detected",
        severity: "warning",
        message: `${shortSignature(repeated.signature)} ran ${repeated.occurrences} times`,
        metadata: { signature: repeated.signature, occurrences: repeated.occurrences },
      });
    }
  }

  for (const signal of inputs.degradation.activeSignals) {
    if (signal.evidence === null) continue;
    signals.push({
      sessionId,
      type: degradationSignalType(signal.name),
      severity: severityFor(signal.severity ?? 0),
      message: capitalize(signal.evidence),
      metadata: { severity: signal.severity, weight: signal.weight },
    });
  }

  if (inputs.loops.successfulCorrectionLoops > 0) {
    signals.push({
      sessionId,
      type: "correction_loop_completed",
      severity: "info",
      message: `${inputs.loops.successfulCorrectionLoops} correction ${plural(inputs.loops.successfulCorrectionLoops, "loop", "loops")} ended in success`,
      metadata: {
        correctionLoops: inputs.loops.correctionLoops,
        successful: inputs.loops.successfulCorrectionLoops,
      },
    });
  }

  for (const trend of [inputs.trends.errorRate, inputs.trends.recoveryRate, inputs.trends.repetitionRate, inputs.trends.toolEfficiency]) {
    if (trend.delta === null || Math.abs(trend.delta) < config.explain.minReportableDelta) continue;
    const improved = isLowerBetter(trend.metric) ? trend.delta < 0 : trend.delta > 0;
    if (!improved) continue;
    const described = describeChange(trend);
    if (described === null) continue;
    signals.push({
      sessionId,
      type: positiveSignalType(trend.metric),
      severity: "info",
      message: described.message,
      metadata: { metric: trend.metric, delta: trend.delta },
    });
  }

  return signals;
}

function degradationSignalType(name: string): SignalCreate["type"] {
  switch (name) {
    case "repeatedFailedActions":
      return "repeated_failed_action";
    case "increasingErrors":
      return "increasing_error_rate";
    case "recoveryDecline":
      return "declining_recovery_rate";
    case "correctionLoops":
      return "increasing_correction_loops";
    case "goalDrift":
      return "possible_goal_drift";
    default:
      return "high_context_pressure";
  }
}

function positiveSignalType(metric: TrendMetric): SignalCreate["type"] {
  switch (metric) {
    case "errorRate":
      return "error_rate_improved";
    case "recoveryRate":
      return "recovery_rate_improved";
    case "repetitionRate":
      return "repetition_reduced";
    default:
      return "tool_efficiency_improved";
  }
}

function severityFor(severity: number): SignalSeverity {
  if (severity >= 0.75) return "critical";
  if (severity >= 0.4) return "warning";
  return "info";
}

/** Trims a signature to something readable in a dashboard row. */
function shortSignature(signature: string): string {
  const parts = signature.split("|");
  const command = parts.find((part) => part.startsWith("cmd:"));
  if (command !== undefined) return command.slice(4);
  const path = parts.find((part) => part.startsWith("path:"));
  if (path !== undefined) return path.slice(5);
  const tool = parts.find((part) => part.startsWith("tool:"));
  if (tool !== undefined) return tool.slice(5);
  return parts[0] ?? signature;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function dedupe(reasons: readonly Reason[]): Reason[] {
  const seen = new Set<string>();
  const unique: Reason[] = [];
  for (const reason of reasons) {
    if (seen.has(reason.message)) continue;
    seen.add(reason.message);
    unique.push(reason);
  }
  return unique;
}
