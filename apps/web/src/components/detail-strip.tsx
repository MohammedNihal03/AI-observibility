import type { CSSProperties } from "react";

import type { SessionSnapshot } from "@observatory/shared";

import { buildDetailStats } from "@/lib/tiles";

import { TONE_TEXT, Value } from "./ui";

/**
 * What the adapter saw that the engine does not score.
 *
 * The rail above holds the metrics health is computed from. These are
 * observations - how much code moved, how much of the spend was reasoning, how
 * much context came back from cache - that describe the session without judging
 * it, so they get a quieter row: no meters, smaller numerals, one line each.
 *
 * Renders nothing when the adapter reported none of it. An empty strip is
 * better than four cells reading "n/a".
 */
export function DetailStrip({ snapshot }: { snapshot: SessionSnapshot }) {
  const stats = buildDetailStats(snapshot);
  if (stats.length === 0) return null;

  return (
    <section
      className="glass rise grid grid-cols-2 rounded-3xl lg:grid-cols-4"
      style={{ "--rise-delay": "220ms" } as CSSProperties}
    >
      {stats.map((stat) => (
        <div
          key={stat.key}
          className="flex flex-col gap-1.5 border-b border-border/70 px-5 py-4 last:border-b-0 sm:px-6 lg:border-b-0 lg:border-r lg:last:border-r-0"
        >
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-fg-faint">
            {stat.label}
          </span>
          <Value
            className={`text-xl font-medium leading-none ${
              stat.tone === "neutral" ? "text-fg-muted" : TONE_TEXT[stat.tone]
            }`}
          >
            {stat.value}
          </Value>
          <span className="text-[11px] leading-tight text-fg-faint">{stat.note}</span>
        </div>
      ))}
    </section>
  );
}
