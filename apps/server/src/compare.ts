import {
  LOWER_IS_BETTER,
  type AgentState,
  type GroupBy,
  type GroupComparison,
  type GroupStats,
  type MetricDelta,
  type SessionComparison,
  type SessionSnapshot,
} from "@observatory/shared";

import { analyzeStoredSession, buildSnapshot, type AnalyzedSession } from "./snapshot.js";
import type { Store } from "./db/store.js";

/**
 * Session, model and prompt comparison (BUILD.md section 65, V2).
 *
 * One question in three shapes: was this session better than that one, is one
 * model behaving better than another, does one way of phrasing a task work
 * better than another. All three reduce to grouping sessions and comparing the
 * same measured aggregates.
 *
 * ## What is deliberately not claimed
 *
 * Grouped comparison is observational, never causal. Two sessions differ in the
 * model AND the task AND the day; attributing the gap to the model is a claim
 * this data cannot support. Every group therefore carries its `sessions` count
 * so a difference drawn from one session each is visibly worth nothing, and the
 * word used throughout is "difference", not "improvement".
 */

function pick(snapshot: SessionSnapshot, metric: string): number | null {
  switch (metric) {
    case "health":
      return snapshot.scores.health;
    case "learning":
      return snapshot.scores.learning;
    case "successRate":
      return snapshot.metrics.successRate;
    case "recoveryRate":
      return snapshot.metrics.recoveryRate;
    case "toolEfficiency":
      return snapshot.metrics.toolEfficiency;
    case "repetitionRate":
      return snapshot.metrics.repetitionRate;
    case "errorRate":
      return snapshot.metrics.errorRate;
    default:
      return null;
  }
}

function deltaOf(metric: string, left: number | null, right: number | null): MetricDelta {
  if (left === null || right === null) {
    return { metric, left, right, delta: null, better: null };
  }
  const delta = right - left;
  const lowerIsBetter = LOWER_IS_BETTER.includes(metric);
  return {
    metric,
    left,
    right,
    delta,
    better: delta === 0 ? null : lowerIsBetter ? delta < 0 : delta > 0,
  };
}

const DELTA_METRICS: readonly string[] = [
  "health",
  "learning",
  "successRate",
  "errorRate",
  "recoveryRate",
  "repetitionRate",
  "toolEfficiency",
];

/** Compares two sessions the store already holds. */
export function compareSessions(
  store: Store,
  leftId: string,
  rightId: string,
): SessionComparison | undefined {
  const left = analyzeStoredSession(store, leftId);
  const right = analyzeStoredSession(store, rightId);
  if (left === undefined || right === undefined) return undefined;

  const leftSnapshot = buildSnapshot(left);
  const rightSnapshot = buildSnapshot(right);

  const leftSignals = new Set(leftSnapshot.signals.map((signal) => signal.message));
  const rightSignals = new Set(rightSnapshot.signals.map((signal) => signal.message));

  return {
    left: leftSnapshot,
    right: rightSnapshot,
    deltas: DELTA_METRICS.map((metric) =>
      deltaOf(metric, pick(leftSnapshot, metric), pick(rightSnapshot, metric)),
    ),
    onlyLeftSignals: [...leftSignals].filter((message) => !rightSignals.has(message)),
    onlyRightSignals: [...rightSignals].filter((message) => !leftSignals.has(message)),
  };
}

/* -------------------------------------------------------------------------- */
/* Grouped comparison                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The median of the values that exist.
 *
 * Median rather than mean throughout: sessions vary enormously in length and
 * difficulty, and one three-hour disaster would drag a mean far enough to
 * reverse a comparison. Null when nothing was measurable.
 */
function median(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (present.length === 0) return null;
  const middle = Math.floor(present.length / 2);
  return present.length % 2 === 1
    ? (present[middle] ?? null)
    : ((present[middle - 1] ?? 0) + (present[middle] ?? 0)) / 2;
}

function groupKey(analyzed: AnalyzedSession, groupBy: GroupBy): string | null {
  switch (groupBy) {
    case "model":
      return analyzed.record.model;
    case "source":
      return analyzed.record.source;
    case "goal":
      return analyzed.record.goal;
  }
}

/**
 * Groups every stored session and reports each group's medians.
 *
 * `model` answers "is Opus behaving differently from Sonnet here"; `goal`
 * answers the prompt-comparison question, "does phrasing the task this way go
 * better than that way".
 */
export function compareGroups(store: Store, groupBy: GroupBy, limit = 200): GroupComparison {
  const records = store.sessions.list({ limit });
  const buckets = new Map<string, AnalyzedSession[]>();
  let ungrouped = 0;

  for (const record of records) {
    const analyzed = analyzeStoredSession(store, record.id);
    if (analyzed === undefined) continue;

    const key = groupKey(analyzed, groupBy);
    if (key === null || key === "") {
      ungrouped += 1;
      continue;
    }

    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [analyzed]);
    else bucket.push(analyzed);
  }

  const groups: GroupStats[] = [...buckets.entries()].map(([key, sessions]) => {
    const states: Record<AgentState, number> = {
      improving: 0,
      stable: 0,
      degrading: 0,
      insufficient_data: 0,
    };
    for (const session of sessions) states[session.analysis.currentState] += 1;

    return {
      key,
      sessions: sessions.length,
      totalEvents: sessions.reduce((total, session) => total + session.events.length, 0),
      health: median(sessions.map((session) => session.analysis.health.score)),
      learning: median(sessions.map((session) => session.analysis.learning.score)),
      successRate: median(sessions.map((session) => session.analysis.metrics.successRate)),
      recoveryRate: median(sessions.map((session) => session.analysis.metrics.recoveryRate)),
      repetitionRate: median(sessions.map((session) => session.analysis.metrics.repetitionRate)),
      states,
    };
  });

  // Most-observed group first: the one whose numbers mean the most.
  groups.sort((a, b) => b.sessions - a.sessions || (b.health ?? -1) - (a.health ?? -1));

  return { groupBy, groups, ungrouped };
}
