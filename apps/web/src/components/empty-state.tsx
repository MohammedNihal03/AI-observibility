import Image from "next/image";
import type { CSSProperties } from "react";

import { ArrowUpRight } from "./icons";
import { Panel } from "./ui";

/**
 * Dashboard empty state (BUILD.md section 60).
 *
 * It has to carry the product on first run, so it explains what the tool will
 * show instead of apologising for having no data. Left-aligned and asymmetric:
 * a centred column of text under a centred glyph is the default shape of every
 * empty state ever shipped, and this one should not look like it.
 */

const PREVIEW = [
  {
    label: "Agent health",
    detail: "A 0-100 score with the five measured components that produced it.",
  },
  {
    label: "Behavioral learning",
    detail: "Whether behaviour improved, held steady or degraded within the session.",
  },
  {
    label: "Correction loops",
    detail: "Failure, investigation, edit, retry - and whether the retry worked.",
  },
  {
    label: "Timeline",
    detail: "Every tool call, failure and recovery in the order it happened.",
  },
] as const;

export function EmptyState() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <Panel edge bloom delay={40} className="p-8 sm:p-12">
        <span className="relative flex size-12 items-center justify-center">
          <span className="absolute inset-0 rounded-2xl bg-clay/20 blur-xl" />
          <Image
            src="/brand/claude-mark.png"
            alt=""
            width={44}
            height={44}
            className="relative"
            priority
          />
        </span>

        <h1 className="mt-8 max-w-[22ch] text-balance text-3xl font-medium leading-[1.08] tracking-tight text-fg sm:text-4xl">
          No sessions recorded yet
        </h1>

        <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-fg-muted">
          Start a Claude Code or Codex session with the collector running, or generate a simulated
          one to see the dashboard with data in it.
        </p>

        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border bg-canvas/60 px-4 py-3.5">
          <span aria-hidden="true" className="select-none font-mono text-sm text-clay">
            $
          </span>
          <code className="scroll-slim overflow-x-auto whitespace-nowrap font-mono text-[13px] text-fg">
            observatory demo --scenario improving
          </code>
          <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-fg-faint" />
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-fg-faint">
          Simulated sessions are labelled as simulated everywhere they appear. They are never
          presented as observed agent telemetry.
        </p>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:content-start">
        {PREVIEW.map((item, index) => (
          <Panel key={item.label} delay={120 + index * 70} className="p-6">
            <h2 className="text-[10px] font-medium uppercase tracking-[0.16em] text-fg-faint">
              {item.label}
            </h2>
            <p className="mt-2.5 text-[13px] leading-relaxed text-fg-muted">{item.detail}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}

/** Skeleton shown while a session loads (Phase 7, once fetching is real). */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading session">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <SkeletonPanel height="h-[420px]" />
        <SkeletonPanel height="h-[420px]" delay={80} />
      </div>
      <SkeletonPanel height="h-[168px]" delay={160} />
    </div>
  );
}

function SkeletonPanel({ height, delay = 0 }: { height: string; delay?: number }) {
  return (
    <div
      className={`glass rise relative overflow-hidden rounded-3xl ${height}`}
      style={{ "--rise-delay": `${delay}ms` } as CSSProperties}
    >
      <div
        className="absolute inset-y-0 -left-full w-full bg-gradient-to-r from-transparent via-fg/[0.04] to-transparent"
        style={{ animation: "shimmer 1.8s ease-in-out infinite" }}
      />
    </div>
  );
}
