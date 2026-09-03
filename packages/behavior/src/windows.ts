import {
  DEFAULT_SCORING_CONFIG,
  isActionEvent,
  type NormalizedAgentEvent,
  type ScoringConfig,
} from "@observatory/shared";
import { computeCounters, errorRate, successRate, toolEfficiency } from "@observatory/metrics";

import { pairActionsWithOutcomes } from "./pairing.js";
import { analyzeRecovery } from "./recovery.js";
import { detectRepetition } from "./repetition.js";

/**
 * Rolling windows (BUILD.md section 21).
 *
 * Section 21 is a warning about a specific mistake: comparing the first event
 * to the last event. One unlucky command at the start or a flaky test at the
 * end would then define the session's entire trend. Splitting into early /
 * middle / recent windows and comparing aggregates makes a single event
 * unable to move the verdict much.
 *
 * Windows are split by ACTION COUNT, not by wall-clock time. An agent that sat
 * idle for twenty minutes and then worked hard for two should not have most of
 * its behavior crammed into one time-based window.
 */

export interface WindowMetrics {
  readonly label: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly events: number;
  readonly actions: number;
  readonly successRate: number | null;
  readonly errorRate: number | null;
  readonly toolEfficiency: number | null;
  readonly recoveryRate: number | null;
  readonly repetitionRate: number | null;
  readonly correctionLoopRate: number | null;
  readonly goalAdherence: number | null;
}

export interface WindowSet {
  readonly windows: readonly WindowMetrics[];
  /** True when there were not enough events to form trustworthy windows. */
  readonly insufficient: boolean;
  readonly totalActions: number;
}

const LABELS = ["early", "middle", "recent"] as const;

function labelFor(index: number, count: number): string {
  if (count === LABELS.length) return LABELS[index] ?? `window_${index + 1}`;
  if (index === 0) return "early";
  if (index === count - 1) return "recent";
  return `window_${index + 1}`;
}

/**
 * Splits events into contiguous windows containing roughly equal numbers of
 * ACTIONS. Non-action events travel with the action they follow, so a window's
 * token totals and file counts stay coherent.
 */
export function splitIntoWindows(
  events: readonly NormalizedAgentEvent[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): readonly { startIndex: number; endIndex: number }[] {
  const count = Math.max(2, config.windows.count);
  const actionIndices: number[] = [];
  events.forEach((event, index) => {
    if (isActionEvent(event)) actionIndices.push(index);
  });

  if (actionIndices.length < count) return [];

  const perWindow = actionIndices.length / count;
  const boundaries: { startIndex: number; endIndex: number }[] = [];

  let cursor = 0;
  for (let window = 0; window < count; window += 1) {
    const lastActionPosition = Math.min(
      actionIndices.length - 1,
      Math.ceil((window + 1) * perWindow) - 1,
    );
    const isLast = window === count - 1;
    const endIndex = isLast ? events.length - 1 : (actionIndices[lastActionPosition] ?? cursor);

    boundaries.push({ startIndex: cursor, endIndex });
    cursor = endIndex + 1;
  }

  return boundaries.filter((boundary) => boundary.endIndex >= boundary.startIndex);
}

export interface WindowOptions {
  readonly config?: ScoringConfig;
  /** Adherence measured per window, supplied by the goal-drift detector. */
  readonly goalAdherenceFor?: (slice: readonly NormalizedAgentEvent[]) => number | null;
}

/** Computes every rate for one slice of a session. */
export function measureWindow(
  slice: readonly NormalizedAgentEvent[],
  label: string,
  startIndex: number,
  endIndex: number,
  options: WindowOptions = {},
): WindowMetrics {
  const config = options.config ?? DEFAULT_SCORING_CONFIG;
  const counters = computeCounters(slice);
  const { pairs } = pairActionsWithOutcomes(slice);
  const repetition = detectRepetition(pairs, config);
  const { recovery, loops } = analyzeRecovery(slice, pairs);

  const safe = (numerator: number, denominator: number): number | null =>
    denominator > 0 ? Math.min(1, Math.max(0, numerator / denominator)) : null;

  return {
    label,
    startIndex,
    endIndex,
    events: slice.length,
    actions: pairs.length,
    successRate: successRate(counters),
    errorRate: errorRate(counters),
    toolEfficiency: toolEfficiency(counters),
    recoveryRate: safe(recovery.recoveries, recovery.failures),
    repetitionRate: safe(repetition.repeatedActions, repetition.totalActions),
    correctionLoopRate: safe(loops.successfulCorrectionLoops, loops.correctionLoops),
    goalAdherence: options.goalAdherenceFor?.(slice) ?? null,
  };
}

export function computeWindows(
  events: readonly NormalizedAgentEvent[],
  options: WindowOptions = {},
): WindowSet {
  const config = options.config ?? DEFAULT_SCORING_CONFIG;
  const totalActions = events.filter(isActionEvent).length;
  const boundaries = splitIntoWindows(events, config);

  if (boundaries.length < 2) {
    return { windows: [], insufficient: true, totalActions };
  }

  const windows = boundaries.map((boundary, index) =>
    measureWindow(
      events.slice(boundary.startIndex, boundary.endIndex + 1),
      labelFor(index, boundaries.length),
      boundary.startIndex,
      boundary.endIndex,
      options,
    ),
  );

  // A window too thin to say anything about makes the whole trend unreliable.
  const insufficient = windows.some((window) => window.actions < config.windows.minEventsPerWindow);

  return { windows, insufficient, totalActions };
}
