import type { WindowMetrics } from "./windows.js";

/**
 * Trend extraction from windows (BUILD.md section 21).
 *
 * A trend is computed by least squares over the windows that actually have a
 * value for the metric, not by subtracting the first from the last. With three
 * windows the two approaches usually agree; the regression keeps behaving
 * sensibly when a middle window is unmeasurable, and it does not treat the
 * endpoints as privileged.
 */

/** Metrics a trend can be taken over. */
export type TrendMetric =
  | "successRate"
  | "errorRate"
  | "toolEfficiency"
  | "recoveryRate"
  | "repetitionRate"
  | "correctionLoopRate"
  | "goalAdherence";

export interface Trend {
  readonly metric: TrendMetric;
  /** Value in the earliest window that had one. */
  readonly first: number | null;
  /** Value in the latest window that had one. */
  readonly last: number | null;
  /** last - first, in metric units. Null when fewer than two values exist. */
  readonly delta: number | null;
  /** Least-squares slope per window. Null when fewer than two values exist. */
  readonly slope: number | null;
  /** Relative change against `first`. Null when `first` is 0 or missing. */
  readonly relativeChange: number | null;
  readonly observations: number;
}

export type TrendSet = Readonly<Record<TrendMetric, Trend>>;

export const TREND_METRICS: readonly TrendMetric[] = [
  "successRate",
  "errorRate",
  "toolEfficiency",
  "recoveryRate",
  "repetitionRate",
  "correctionLoopRate",
  "goalAdherence",
];

/**
 * Metrics where a DECREASE is an improvement.
 *
 * Needed because the learning score adds up "improvements": a falling error
 * rate and a rising recovery rate are both good news, and their raw deltas have
 * opposite signs.
 */
const LOWER_IS_BETTER: ReadonlySet<TrendMetric> = new Set<TrendMetric>([
  "errorRate",
  "repetitionRate",
]);

export function isLowerBetter(metric: TrendMetric): boolean {
  return LOWER_IS_BETTER.has(metric);
}

const EMPTY_TREND = (metric: TrendMetric): Trend => ({
  metric,
  first: null,
  last: null,
  delta: null,
  slope: null,
  relativeChange: null,
  observations: 0,
});

export function computeTrend(
  windows: readonly WindowMetrics[],
  metric: TrendMetric,
): Trend {
  const points: { x: number; y: number }[] = [];
  windows.forEach((window, index) => {
    const value = window[metric];
    if (typeof value === "number") points.push({ x: index, y: value });
  });

  if (points.length === 0) return EMPTY_TREND(metric);

  const first = points[0]?.y ?? null;
  const last = points[points.length - 1]?.y ?? null;

  if (points.length === 1 || first === null || last === null) {
    return {
      metric,
      first,
      last,
      delta: null,
      slope: null,
      relativeChange: null,
      observations: points.length,
    };
  }

  const n = points.length;
  const meanX = points.reduce((total, point) => total + point.x, 0) / n;
  const meanY = points.reduce((total, point) => total + point.y, 0) / n;

  let covariance = 0;
  let variance = 0;
  for (const point of points) {
    covariance += (point.x - meanX) * (point.y - meanY);
    variance += (point.x - meanX) ** 2;
  }

  const slope = variance === 0 ? 0 : covariance / variance;
  const delta = last - first;

  return {
    metric,
    first,
    last,
    delta,
    slope,
    // Relative change is undefined against a baseline of zero. An error rate
    // going from 0 to 0.3 has not risen by "infinity percent"; the absolute
    // delta is the only honest description, so this stays null.
    relativeChange: first === 0 ? null : delta / first,
    observations: n,
  };
}

export function computeTrends(windows: readonly WindowMetrics[]): TrendSet {
  const entries = TREND_METRICS.map(
    (metric) => [metric, computeTrend(windows, metric)] as const,
  );
  return Object.fromEntries(entries) as TrendSet;
}

/**
 * The improvement a trend represents, sign-corrected so positive always means
 * "the agent got better".
 */
export function improvementOf(trend: Trend): number | null {
  if (trend.delta === null) return null;
  return isLowerBetter(trend.metric) ? -trend.delta : trend.delta;
}
