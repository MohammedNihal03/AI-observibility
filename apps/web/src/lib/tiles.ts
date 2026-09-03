import type { SessionSnapshot } from "@observatory/shared";

/**
 * Display formatting for the metric strip.
 *
 * Presentation lives on this side of the wire. The API sends numbers; deciding
 * that 446_584 reads as "446.6K" and that a 94% context figure is worth
 * colouring red is a UI judgement, and hard-coding it into the API would make
 * every future client inherit this one's opinions.
 */

export type MetricTone = "neutral" | "healthy" | "warn" | "danger";

export interface MetricTile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly note: string;
  /** 0-1 for the hairline under the value. Null when the metric has no ceiling. */
  readonly fill: number | null;
  readonly tone: MetricTone;
}

export function percent(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

export function compact(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/u, "")}K`;
  return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/u, "")}M`;
}

export function duration(ms: number | null): string {
  if (ms === null) return "n/a";
  const seconds = Math.round(ms / 1_000);
  const minutes = Math.floor(seconds / 60);
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function clockOf(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function band(value: number | null, good: number, fair: number): MetricTone {
  if (value === null) return "neutral";
  if (value >= good) return "healthy";
  if (value >= fair) return "warn";
  return "danger";
}

export function buildTiles(snapshot: SessionSnapshot): readonly MetricTile[] {
  const { metrics } = snapshot;
  const counters = metrics.counters;

  const errorTone: MetricTone =
    metrics.errorRate === null ? "neutral" : band(1 - metrics.errorRate, 0.8, 0.5);

  const contextTone: MetricTone =
    metrics.contextPressure === null
      ? "neutral"
      : metrics.contextPressure < 0.75
        ? "neutral"
        : metrics.contextPressure < 0.9
          ? "warn"
          : "danger";

  return [
    {
      key: "tokens",
      label: "Tokens",
      value: compact(metrics.tokens.total),
      note: `${compact(metrics.tokens.cached)} cached`,
      fill: null,
      tone: "neutral",
    },
    {
      key: "actions",
      label: "Actions",
      value: String(counters.totalToolCalls),
      note: `${counters.filesRead} read · ${counters.filesModified} edited`,
      fill: null,
      tone: "neutral",
    },
    {
      key: "errors",
      label: "Errors",
      value: String(counters.errors),
      note: `${percent(metrics.errorRate)} of resolved calls`,
      fill: metrics.errorRate,
      tone: errorTone,
    },
    {
      key: "recovery",
      label: "Recovery",
      value: percent(metrics.recoveryRate),
      note:
        metrics.recoveryRate === null
          ? "no failures to recover from"
          : `${counters.failedToolCalls} failed calls`,
      fill: metrics.recoveryRate,
      tone: band(metrics.recoveryRate, 0.8, 0.5),
    },
    {
      key: "repetition",
      label: "Repetition",
      value: percent(metrics.repetitionRate),
      note: "repeated actions / measurable",
      fill: metrics.repetitionRate,
      tone: "neutral",
    },
    {
      key: "context",
      label: "Context",
      value: percent(metrics.contextPressure),
      note:
        snapshot.session.contextWindow === null
          ? "no window reported"
          : `of ${compact(snapshot.session.contextWindow)} reported`,
      fill: metrics.contextPressure,
      tone: contextTone,
    },
  ];
}
