import type { CSSProperties } from "react";

import type { SessionSnapshot } from "@observatory/shared";

import { buildTiles } from "@/lib/tiles";

import { Meter, TONE_TEXT, Value } from "./ui";

/**
 * The metric strip (BUILD.md section 62's `Tokens | Tools | Errors | ...` row).
 *
 * Deliberately NOT six cards. Six boxed cards in a row is the single most
 * over-produced pattern in dashboard design, and boxing a number that needs no
 * elevation only adds edges to look at. One pane, hairline dividers, numbers in
 * mono so the columns line up.
 */
export function MetricRail({ snapshot }: { snapshot: SessionSnapshot }) {
  const tiles = buildTiles(snapshot);

  return (
    <section
      className="glass rise grid grid-cols-2 rounded-3xl sm:grid-cols-3 lg:grid-cols-6"
      style={{ "--rise-delay": "180ms" } as CSSProperties}
    >
      {tiles.map((metric, index) => (
        <div
          key={metric.key}
          className="group flex flex-col gap-3 border-b border-border/70 p-5 transition-colors duration-300 last:border-b-0 hover:bg-fg/[0.02] sm:p-6 lg:border-b-0 lg:border-r lg:last:border-r-0"
          style={{ "--rise-delay": `${200 + index * 40}ms` } as CSSProperties}
        >
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-fg-faint">
            {metric.label}
          </span>

          <Value
            className={`text-3xl font-medium leading-none ${
              metric.tone === "neutral" ? "text-fg" : TONE_TEXT[metric.tone]
            }`}
          >
            {metric.value}
          </Value>

          <Meter value={metric.fill} tone={metric.tone === "neutral" ? "clay" : metric.tone} />

          <span className="text-[11px] leading-tight text-fg-faint">{metric.note}</span>
        </div>
      ))}
    </section>
  );
}
