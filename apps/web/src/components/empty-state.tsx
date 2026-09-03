"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

import { API_BASE } from "@/lib/api";

import { Alert, ArrowUpRight } from "./icons";
import { Panel } from "./ui";

/**
 * Dashboard empty state (BUILD.md section 60).
 *
 * It has to carry the product on first run, so it explains what the tool will
 * show instead of apologising for having no data. Left-aligned and asymmetric:
 * a centred column of text under a centred glyph is the default shape of every
 * empty state ever shipped, and this one should not look like it.
 */

const COMMANDS = [
  {
    command: "observatory import",
    detail: "Reads a real Claude Code session from its local transcript.",
  },
  {
    command: "observatory demo --scenario improving --stream",
    detail: "Generates a simulated session and streams it in live.",
  },
] as const;

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
          Observe a Claude Code session you have already run, or generate a simulated one to see the
          dashboard with data in it.
        </p>

        <ul className="mt-8 flex flex-col gap-3">
          {COMMANDS.map((entry) => (
            <li key={entry.command}>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-canvas/60 px-4 py-3.5">
                <span aria-hidden="true" className="select-none font-mono text-sm text-clay">
                  $
                </span>
                <code className="scroll-slim overflow-x-auto whitespace-nowrap font-mono text-[13px] text-fg">
                  {entry.command}
                </code>
                <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-fg-faint" />
              </div>
              <p className="mt-1.5 pl-4 text-[11px] text-fg-faint">{entry.detail}</p>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-[11px] leading-relaxed text-fg-faint">
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

/**
 * Shown when the API cannot be reached.
 *
 * Distinct from the empty state on purpose: "no sessions yet" and "the server
 * is not running" call for completely different actions, and collapsing them
 * into one message sends a developer looking for the wrong problem.
 */
export function UnreachableState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <Panel edge delay={40} className="p-8 sm:p-12">
        <span className="flex size-10 items-center justify-center rounded-2xl border border-warn/30 bg-warn/[0.08] text-warn">
          <Alert className="size-4" />
        </span>

        <h1 className="mt-8 max-w-[22ch] text-balance text-3xl font-medium leading-[1.08] tracking-tight text-fg sm:text-4xl">
          The Observatory API is not answering
        </h1>

        <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-fg-muted">
          The dashboard talks to a local server on{" "}
          <code className="font-mono text-fg">{API_BASE}</code>. Start it and this page will fill
          itself in.
        </p>

        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border bg-canvas/60 px-4 py-3.5">
          <span aria-hidden="true" className="select-none font-mono text-sm text-clay">
            $
          </span>
          <code className="scroll-slim overflow-x-auto whitespace-nowrap font-mono text-[13px] text-fg">
            npm run dev
          </code>
        </div>

        <button
          type="button"
          onClick={onRetry}
          className="mt-5 self-start rounded-full border border-border bg-surface px-4 py-2 text-[12px] font-medium text-fg-muted transition-colors duration-300 hover:border-border-strong hover:text-fg active:scale-[0.98]"
        >
          Try again
        </button>
      </Panel>

      <Panel delay={140} className="p-6 sm:p-8">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.16em] text-fg-faint">
          Nothing left this machine
        </h2>
        <p className="mt-2.5 text-[13px] leading-relaxed text-fg-muted">
          The dashboard has no cloud fallback to fail over to, because there is no cloud. When the
          local server is down there is genuinely nothing to show, and inventing something would
          defeat the point of the tool.
        </p>
      </Panel>
    </div>
  );
}

/** Skeleton shown while a session loads. */
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
