/**
 * Safe division, and the single most important decision in this package.
 *
 * `0 / 0` must be null, not 0 and not NaN. A session with no finished tool
 * calls does not have a 0% success rate - it has no success rate. Returning 0
 * would put "0% success" on the dashboard and assert that everything failed,
 * which is a claim the data does not support (BUILD.md sections 22, 27).
 *
 * Every rate in this package goes through here.
 */
export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** A ratio clamped to 0-1, for values that are rates by definition. */
export function rate(numerator: number, denominator: number): number | null {
  const value = ratio(numerator, denominator);
  if (value === null) return null;
  return Math.min(1, Math.max(0, value));
}

/** Rounds to a fixed number of decimals without turning null into a number. */
export function round(value: number | null, decimals = 4): number | null {
  if (value === null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Percentage form for display. Null in, null out. */
export function toPercent(value: number | null, decimals = 1): number | null {
  return round(value === null ? null : value * 100, decimals);
}
