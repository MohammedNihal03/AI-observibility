import type { SessionSnapshot } from "./dashboard.js";
import type { AgentState } from "./session.js";

/**
 * The comparison contract (BUILD.md section 65, V2).
 *
 * Lives beside `SessionSnapshot` for the same reason: the server computes it,
 * the dashboard and the CLI render it, and neither of those should import the
 * other. Types only - the server builds these values from its own engine rather
 * than parsing them from anywhere.
 */

/** How sessions can be grouped for an aggregate comparison. */
export const GROUP_KEYS = ["model", "goal", "source"] as const;
export type GroupBy = (typeof GROUP_KEYS)[number];

export interface MetricDelta {
  readonly metric: string;
  readonly left: number | null;
  readonly right: number | null;
  /** right - left. Null when either side could not be measured. */
  readonly delta: number | null;
  /**
   * True when the change is in the better direction.
   *
   * Null covers two different things and the UI must not conflate them: the
   * metric was unmeasurable, or it did not move at all.
   */
  readonly better: boolean | null;
}

export interface SessionComparison {
  readonly left: SessionSnapshot;
  readonly right: SessionSnapshot;
  readonly deltas: readonly MetricDelta[];
  /** Signals one session raised and the other did not. */
  readonly onlyLeftSignals: readonly string[];
  readonly onlyRightSignals: readonly string[];
}

export interface GroupStats {
  readonly key: string;
  readonly sessions: number;
  readonly totalEvents: number;
  /** Medians, not means: one catastrophic session should not define a model. */
  readonly health: number | null;
  readonly learning: number | null;
  readonly successRate: number | null;
  readonly recoveryRate: number | null;
  readonly repetitionRate: number | null;
  readonly states: Readonly<Record<AgentState, number>>;
}

export interface GroupComparison {
  readonly groupBy: GroupBy;
  readonly groups: readonly GroupStats[];
  /** Sessions that had no value for the grouping key. */
  readonly ungrouped: number;
}

/** Metrics where a LOWER value is the better one. */
export const LOWER_IS_BETTER: readonly string[] = ["errorRate", "repetitionRate"];

/** Labels for the compared metrics, shared by the CLI and the dashboard. */
export const METRIC_LABELS: Readonly<Record<string, string>> = {
  health: "Health",
  learning: "Learning",
  successRate: "Success rate",
  errorRate: "Error rate",
  recoveryRate: "Recovery rate",
  repetitionRate: "Repetition",
  toolEfficiency: "Tool efficiency",
};

/** Metrics expressed as a 0-1 rate rather than a 0-100 score. */
export const RATE_METRICS: readonly string[] = [
  "successRate",
  "errorRate",
  "recoveryRate",
  "repetitionRate",
  "toolEfficiency",
];
