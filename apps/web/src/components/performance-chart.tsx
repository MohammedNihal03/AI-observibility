"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SessionSnapshot, TrendPoint } from "@observatory/shared";

import { Panel, SectionLabel, Value } from "./ui";

/**
 * Agent performance over the session (BUILD.md section 37's chart).
 *
 * Each point is the behavioural engine measuring the session UP TO that action -
 * the same call, on the same events, that produced the headline score. That is
 * why the last point of the curve and the number on the health card are always
 * the same figure: they are one calculation, not two.
 *
 * It is not a rolling window. A rolling window would swing wildly on a session
 * this size and imply precision the data does not have; a cumulative reading is
 * what a developer watching the session live would actually have seen.
 */

interface ChartRow {
  actions: number;
  health: number | null;
  success: number | null;
}

const GRID = "#24262c";
const CHART_HEIGHT = 260;

/**
 * Width of an element, tracked.
 *
 * Recharts ships `ResponsiveContainer` for this, but under React 19 it settles
 * on 0x0 and silently renders an empty box - the chart is simply absent, with
 * no error to follow. Measuring here is a dozen lines, disconnects cleanly, and
 * cannot fail quietly: if the width is 0 the component renders a placeholder
 * that is obviously a placeholder.
 */
function useMeasuredWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    setWidth(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured !== undefined) setWidth(Math.round(measured));
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
}) {
  const row = payload?.[0]?.payload;
  if (active !== true || row === undefined) return null;

  return (
    <div className="glass rounded-xl px-3.5 py-2.5 text-xs">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">
        after {row.actions} actions
      </p>
      <p className="mt-1.5 flex items-center gap-2 text-fg">
        <span className="size-1.5 rounded-full bg-clay" />
        Health <Value className="text-fg">{row.health ?? "n/a"}</Value>
      </p>
      <p className="mt-1 flex items-center gap-2 text-fg-muted">
        <span className="size-1.5 rounded-full bg-fg-faint" />
        Success{" "}
        <Value className="text-fg-muted">{row.success === null ? "n/a" : `${row.success}%`}</Value>
      </p>
    </div>
  );
}

export function PerformanceChart({ snapshot }: { snapshot: SessionSnapshot }) {
  const [containerRef, width] = useMeasuredWidth();

  const data = useMemo<ChartRow[]>(
    () =>
      snapshot.trend.map((point: TrendPoint) => ({
        actions: point.actions,
        health: point.health,
        success: point.successRate === null ? null : Math.round(point.successRate * 100),
      })),
    [snapshot.trend],
  );

  const first = data.find((row) => row.health !== null)?.health ?? null;
  const last = [...data].reverse().find((row) => row.health !== null)?.health ?? null;
  const move = first !== null && last !== null ? last - first : null;

  return (
    <Panel delay={240} className="p-7 sm:p-8">
      <SectionLabel
        note={
          move === null ? (
            "not measurable"
          ) : (
            <span className={move >= 0 ? "text-healthy" : "text-danger"}>
              {move > 0 ? "+" : ""}
              {move} points across the session
            </span>
          )
        }
      >
        Agent performance
      </SectionLabel>

      <div className="mt-2 flex items-center gap-5 text-[11px] text-fg-faint">
        <span className="flex items-center gap-2">
          <span className="h-px w-4 bg-clay" />
          Health
        </span>
        <span className="flex items-center gap-2">
          <span className="h-px w-4 bg-fg-faint" />
          Success rate
        </span>
      </div>

      <div ref={containerRef} className="mt-6 w-full" style={{ height: CHART_HEIGHT }}>
        {width === 0 ? (
          <div
            className="size-full rounded-2xl border border-border/60"
            aria-hidden="true"
            style={{ animation: "shimmer 1.8s ease-in-out infinite" }}
          />
        ) : (
          // Composed, not AreaChart: mixing a Line into an AreaChart is not a
          // supported combination.
          <ComposedChart
            data={data}
            width={width}
            height={CHART_HEIGHT}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="healthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d97757" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#d97757" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={GRID} strokeDasharray="2 6" vertical={false} />
            <ReferenceLine y={50} stroke={GRID} strokeDasharray="4 4" />

            <XAxis
              dataKey="actions"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickMargin={10}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              // Wide enough for a three-digit tick. At 44 with a negative left
              // margin, "100" rendered as "00".
              width={34}
            />

            <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID, strokeWidth: 1 }} />

            <Area
              type="monotone"
              dataKey="health"
              stroke="#d97757"
              strokeWidth={2}
              fill="url(#healthFill)"
              connectNulls
              dot={false}
              activeDot={{ r: 3.5, fill: "#d97757", stroke: "#0b0c0e", strokeWidth: 2 }}
              isAnimationActive
              animationDuration={900}
            />
            <Line
              type="monotone"
              dataKey="success"
              stroke="#6b7280"
              strokeWidth={1.25}
              strokeDasharray="3 4"
              connectNulls
              dot={false}
              activeDot={false}
              isAnimationActive
              animationDuration={1100}
            />
          </ComposedChart>
        )}
      </div>

      <p className="mt-4 border-t border-border pt-4 text-[11px] leading-relaxed text-fg-faint">
        Health measured cumulatively at {snapshot.trend.length} points, x-axis in completed actions.
        The final point is the headline score.
      </p>
    </Panel>
  );
}
