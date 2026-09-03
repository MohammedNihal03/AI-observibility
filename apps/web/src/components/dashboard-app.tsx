"use client";

import { useObservatory } from "@/lib/use-observatory";

import { ActivityTimeline } from "./activity-timeline";
import { AppShell } from "./app-shell";
import { DashboardSkeleton, EmptyState, UnreachableState } from "./empty-state";
import { HealthCard } from "./health-card";
import { MetricRail } from "./metric-rail";
import { PerformanceChart } from "./performance-chart";
import { SessionBar } from "./session-bar";
import { SessionPicker } from "./session-picker";
import { SignalList } from "./signal-list";
import { StatusPill } from "./status-pill";
import { WhyPanel } from "./why-panel";
import { WindowTable } from "./window-table";

/**
 * The dashboard (BUILD.md sections 36, 37, 62; Phases 8 and 9).
 *
 * Reading order is the order a developer asks the questions in: what is this
 * session, how healthy is it, why, how did it get here, what fired, and finally
 * the raw events that back all of it up.
 *
 * The grid is deliberately asymmetric - the hero takes more width than the
 * explanation, the timeline more than the signals - and collapses to a single
 * column below `lg`.
 */
export function DashboardApp() {
  const { status, sessions, activeId, snapshot, live, received, select, refresh } =
    useObservatory();

  const shell = (children: React.ReactNode): React.ReactElement => (
    <AppShell
      toolbar={
        sessions.length > 0 ? (
          <SessionPicker sessions={sessions} activeId={activeId} onSelect={select} />
        ) : null
      }
      // No pill when there is no session to describe. "Offline" would be
      // false - the server answered, it simply has nothing recorded - and the
      // empty and unreachable states already say which of the two it is.
      status={
        status === "unreachable" || status === "empty" ? null : (
          <StatusPill snapshot={snapshot} live={live} loading={status === "loading"} />
        )
      }
    >
      {children}
    </AppShell>
  );

  if (status === "unreachable") return shell(<UnreachableState onRetry={refresh} />);
  if (status === "empty") return shell(<EmptyState />);
  if (snapshot === null) return shell(<DashboardSkeleton />);

  return shell(
    // Re-keying on the session replays the staggered entrance, so switching
    // sessions reads as new data arriving rather than numbers mutating in place.
    <div key={snapshot.session.id} className="flex flex-col gap-4 sm:gap-5">
      <SessionBar snapshot={snapshot} received={received} live={live} />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <HealthCard snapshot={snapshot} />
        <WhyPanel snapshot={snapshot} />
      </div>

      <MetricRail snapshot={snapshot} />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <PerformanceChart snapshot={snapshot} />
        <WindowTable snapshot={snapshot} />
      </div>

      {/* `items-start` so each panel keeps its natural height - a signals list
          with three entries should not be stretched to match a long timeline. */}
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <SignalList snapshot={snapshot} />
        <ActivityTimeline snapshot={snapshot} live={live} />
      </div>
    </div>,
  );
}
