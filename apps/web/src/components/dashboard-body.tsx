"use client";

import { ActivityTimeline } from "./activity-timeline";
import { EmptyState } from "./empty-state";
import { HealthCard } from "./health-card";
import { MetricRail } from "./metric-rail";
import { PerformanceChart } from "./performance-chart";
import { useScenario } from "./scenario-provider";
import { SessionBar } from "./session-bar";
import { SignalList } from "./signal-list";
import { WhyPanel } from "./why-panel";
import { WindowTable } from "./window-table";

/**
 * The dashboard layout (BUILD.md sections 36, 37, 62).
 *
 * Reading order is the order a developer asks the questions in: what is this
 * session, how healthy is it, why, how did it get here, what fired, and finally
 * the raw events that back all of it up.
 *
 * The grid is deliberately asymmetric - the hero takes more width than the
 * explanation, the timeline more than the signals - and collapses to a single
 * column below `lg`.
 */
export function DashboardBody() {
  const scenario = useScenario();
  if (scenario === null) return <EmptyState />;

  const { session } = scenario;

  return (
    // Re-keying on the scenario replays the staggered entrance, so switching
    // sessions reads as new data arriving rather than numbers mutating in place.
    <div key={session.scenario} className="flex flex-col gap-4 sm:gap-5">
      <SessionBar session={session} />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <HealthCard session={session} />
        <WhyPanel session={session} />
      </div>

      <MetricRail session={session} />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <PerformanceChart session={session} />
        <WindowTable session={session} />
      </div>

      {/* `items-start` so each panel keeps its natural height - a signals list
          with three entries should not be stretched to match a long timeline. */}
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <SignalList session={session} />
        <ActivityTimeline session={session} />
      </div>
    </div>
  );
}
