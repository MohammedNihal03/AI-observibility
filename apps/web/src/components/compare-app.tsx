"use client";

import {
  GROUP_KEYS,
  LOWER_IS_BETTER,
  METRIC_LABELS,
  RATE_METRICS,
  type GroupBy,
  type GroupComparison,
  type MetricDelta,
  type SessionComparison,
  type SessionSummary,
} from "@observatory/shared";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

import { ApiUnreachableError, fetchComparison, fetchGroups, fetchSessions } from "@/lib/api";
import { percent } from "@/lib/tiles";

import { AppShell } from "./app-shell";
import { DashboardSkeleton, UnreachableState } from "./empty-state";
import { Alert, TrendDown, TrendFlat, TrendUp } from "./icons";
import { SessionSelect } from "./session-select";
import { Meter, Panel, SectionLabel, TONE_TEXT, toneForState, Value } from "./ui";

/**
 * The comparison view (BUILD.md section 65, V2).
 *
 * Two modes behind one page, because they answer the same question at different
 * scales: two named sessions side by side, or every session grouped by model,
 * prompt or agent.
 *
 * The wording is careful throughout. Grouped comparison is observational - two
 * sessions differ in the model AND the task AND the day - so nothing here says
 * one model is better than another. It shows differences, labels the session
 * count on every row, and leaves the inference to the reader.
 */

type Mode = "sessions" | "groups";

const GROUP_LABELS: Record<GroupBy, string> = {
  model: "Model",
  goal: "Prompt",
  source: "Agent",
};

function StateIcon({ state, className }: { state: string; className: string }) {
  if (state === "improving") return <TrendUp className={className} />;
  if (state === "degrading") return <TrendDown className={className} />;
  return <TrendFlat className={className} />;
}

/** Formats a compared value, respecting whether it is a rate or a score. */
function display(metric: string, value: number | null): string {
  if (value === null) return "n/a";
  return RATE_METRICS.includes(metric) ? percent(value) : String(Math.round(value));
}

function changeLabel(delta: MetricDelta): string {
  if (delta.delta === null) return "";
  const sign = delta.delta > 0 ? "+" : "";
  return RATE_METRICS.includes(delta.metric)
    ? `${sign}${Math.round(delta.delta * 100)} pts`
    : `${sign}${Math.round(delta.delta)}`;
}

/* -------------------------------------------------------------------------- */

function DeltaRow({ delta, index }: { delta: MetricDelta; index: number }) {
  const tone =
    delta.better === null ? "text-fg-faint" : delta.better ? "text-healthy" : "text-danger";
  const lowerIsBetter = LOWER_IS_BETTER.includes(delta.metric);

  return (
    <tr
      className="rise border-t border-border/70"
      style={{ "--rise-delay": `${160 + index * 45}ms` } as CSSProperties}
    >
      <th scope="row" className="py-3.5 text-left text-[13px] font-normal text-fg-muted">
        {METRIC_LABELS[delta.metric] ?? delta.metric}
        {lowerIsBetter ? (
          <span className="ml-2 text-[10px] uppercase tracking-widest text-border-strong">
            lower is better
          </span>
        ) : null}
      </th>
      <td className="py-3.5 text-right">
        <Value className="text-[13px] text-fg-muted">{display(delta.metric, delta.left)}</Value>
      </td>
      <td className="py-3.5 text-right">
        <Value className="text-[13px] text-fg">{display(delta.metric, delta.right)}</Value>
      </td>
      <td className={`py-3.5 pl-6 text-right ${tone}`}>
        <Value className="text-[13px]">{changeLabel(delta)}</Value>
        <span className="ml-2 text-[11px]">
          {delta.better === null
            ? delta.delta === null
              ? "n/a"
              : "unchanged"
            : delta.better
              ? "better"
              : "worse"}
        </span>
      </td>
    </tr>
  );
}

function SignalDiff({
  title,
  signals,
  mark,
}: {
  title: string;
  signals: readonly string[];
  mark: string;
}) {
  return (
    <div>
      <h3 className="text-[10px] font-medium uppercase tracking-[0.16em] text-fg-faint">{title}</h3>
      {signals.length === 0 ? (
        <p className="mt-3 text-[13px] text-fg-faint">Nothing unique to this side.</p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-2">
        {signals.slice(0, 6).map((signal) => (
          <li
            key={signal}
            className="flex items-start gap-2.5 text-[13px] leading-snug text-fg-muted"
          >
            <span className="mt-px font-mono text-fg-faint">{mark}</span>
            <span>{signal}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function CompareApp() {
  const [mode, setMode] = useState<Mode>("sessions");
  const [groupBy, setGroupBy] = useState<GroupBy>("model");
  const [sessions, setSessions] = useState<readonly SessionSummary[]>([]);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [comparison, setComparison] = useState<SessionComparison | null>(null);
  const [groups, setGroups] = useState<GroupComparison | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setUnreachable(false);
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const list = await fetchSessions(controller.signal);
        if (cancelled) return;
        setSessions(list);
        // Newest against the one before it: the comparison a developer who has
        // just finished a session actually wants.
        setLeft((current) => (current === "" ? (list[1]?.id ?? list[0]?.id ?? "") : current));
        setRight((current) => (current === "" ? (list[0]?.id ?? "") : current));
      } catch (cause: unknown) {
        if (!cancelled && cause instanceof ApiUnreachableError) setUnreachable(true);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadToken]);

  useEffect(() => {
    if (mode !== "sessions" || left === "" || right === "" || left === right) {
      setComparison(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const result = await fetchComparison(left, right, controller.signal);
        if (!cancelled) setComparison(result);
      } catch (cause: unknown) {
        if (!cancelled && cause instanceof ApiUnreachableError) setUnreachable(true);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mode, left, right, reloadToken]);

  useEffect(() => {
    if (mode !== "groups") return;

    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const result = await fetchGroups(groupBy, controller.signal);
        if (!cancelled) setGroups(result);
      } catch (cause: unknown) {
        if (!cancelled && cause instanceof ApiUnreachableError) setUnreachable(true);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mode, groupBy, reloadToken]);

  const toolbar = (
    <div className="glass flex w-full rounded-full p-1 sm:w-auto" role="tablist">
      {(["sessions", "groups"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={mode === option}
          onClick={() => setMode(option)}
          className={`flex-1 whitespace-nowrap rounded-full px-4 py-1.5 text-[12px] font-medium tracking-tight transition-colors duration-300 active:scale-[0.98] sm:flex-none ${
            mode === option
              ? "border border-clay/25 bg-clay/[0.12] text-clay-soft"
              : "text-fg-faint hover:text-fg-muted"
          }`}
        >
          {option === "sessions" ? "Two sessions" : "Grouped"}
        </button>
      ))}
    </div>
  );

  if (unreachable) {
    return (
      <AppShell toolbar={null}>
        <UnreachableState onRetry={refresh} />
      </AppShell>
    );
  }

  if (sessions.length < 2 && mode === "sessions") {
    return (
      <AppShell toolbar={toolbar}>
        <Panel edge className="p-8 sm:p-12">
          <span className="flex size-10 items-center justify-center rounded-2xl border border-border bg-surface text-fg-faint">
            <Alert className="size-4" />
          </span>
          <h1 className="mt-8 text-balance text-3xl font-medium tracking-tight text-fg">
            Two sessions are needed to compare
          </h1>
          <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-fg-muted">
            {sessions.length === 0
              ? "Nothing has been recorded yet."
              : "Only one session is recorded so far."}{" "}
            Run <code className="font-mono text-fg">observatory import</code> or{" "}
            <code className="font-mono text-fg">observatory demo --stream</code> to add another.
          </p>
        </Panel>
      </AppShell>
    );
  }

  return (
    <AppShell toolbar={toolbar}>
      {mode === "sessions" ? (
        <div className="flex flex-col gap-4 sm:gap-5">
          {/*
            `relative z-50` is load-bearing. The `rise` entrance animates
            opacity, which makes every panel its own stacking context, and
            sibling contexts paint in DOM order regardless of the z-index INSIDE
            them. The open dropdown's `z-40` therefore lost to a panel further
            down the page, and the comparison table showed straight through it.
            Lifting the row that CONTAINS the dropdown is what fixes it.
          */}
          <div
            className="rise relative z-50 flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end"
            style={{ "--rise-delay": "0ms" } as CSSProperties}
          >
            <SessionSelect label="Left" sessions={sessions} value={left} onChange={setLeft} />
            <span className="hidden pb-3 font-mono text-[11px] text-border-strong sm:block">
              vs
            </span>
            <SessionSelect label="Right" sessions={sessions} value={right} onChange={setRight} />
          </div>

          {left === right ? (
            <Panel className="p-8">
              <p className="text-sm text-fg-muted">
                Pick two different sessions. Comparing a session with itself would show a column of
                zeroes.
              </p>
            </Panel>
          ) : comparison === null ? (
            <DashboardSkeleton />
          ) : (
            <>
              <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
                <Panel edge bloom delay={60} className="p-7 sm:p-9">
                  <SectionLabel note={`${comparison.deltas.length} measures`}>
                    Difference
                  </SectionLabel>

                  <table className="mt-7 w-full border-collapse">
                    <caption className="sr-only">
                      Each measure for the left and right session, and the change between them
                    </caption>
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                        <th scope="col" className="pb-3 text-left font-medium">
                          Measure
                        </th>
                        <th scope="col" className="pb-3 text-right font-medium">
                          Left
                        </th>
                        <th scope="col" className="pb-3 text-right font-medium">
                          Right
                        </th>
                        <th scope="col" className="pb-3 pl-6 text-right font-medium">
                          Change
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.deltas.map((delta, index) => (
                        <DeltaRow key={delta.metric} delta={delta} index={index} />
                      ))}
                    </tbody>
                  </table>
                </Panel>

                <div className="grid gap-4 sm:gap-5">
                  {[comparison.left, comparison.right].map((snapshot, index) => {
                    const tone = toneForState(snapshot.scores.state);
                    return (
                      <Panel
                        key={snapshot.session.id}
                        delay={120 + index * 60}
                        className="p-6 sm:p-7"
                      >
                        <SectionLabel>{index === 0 ? "Left" : "Right"}</SectionLabel>
                        <p
                          className="mt-3 truncate text-[13px] text-fg"
                          title={snapshot.session.goal ?? ""}
                        >
                          {snapshot.session.goal ?? snapshot.session.id}
                        </p>
                        <div className="mt-4 flex items-end gap-3">
                          <Value className="text-4xl font-medium leading-none text-fg">
                            {snapshot.scores.health ?? "n/a"}
                          </Value>
                          <span
                            className={`flex items-center gap-1.5 pb-1 text-xs ${TONE_TEXT[tone]}`}
                          >
                            <StateIcon state={snapshot.scores.state} className="size-3.5" />
                            {snapshot.scores.state.replace("_", " ")}
                          </span>
                        </div>
                        <Meter value={(snapshot.scores.health ?? 0) / 100} className="mt-4" />
                        <p className="mt-3 truncate font-mono text-[11px] text-fg-faint">
                          {snapshot.session.id}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-fg-faint">
                          {snapshot.session.model ?? "model unknown"} ·{" "}
                          {snapshot.session.eventCount} events
                          {snapshot.session.simulated ? " · simulated" : ""}
                        </p>
                      </Panel>
                    );
                  })}
                </div>
              </div>

              {comparison.onlyLeftSignals.length + comparison.onlyRightSignals.length > 0 ? (
                <Panel delay={240} className="p-7 sm:p-8">
                  <SectionLabel note="signals one session raised and the other did not">
                    Signals that differ
                  </SectionLabel>
                  <div className="mt-6 grid gap-8 sm:grid-cols-2">
                    <SignalDiff
                      title="Only on the left"
                      signals={comparison.onlyLeftSignals}
                      mark="◀"
                    />
                    <SignalDiff
                      title="Only on the right"
                      signals={comparison.onlyRightSignals}
                      mark="▶"
                    />
                  </div>
                </Panel>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-5">
          <div
            className="rise flex flex-wrap items-center gap-2 border-b border-border/70 pb-5"
            style={{ "--rise-delay": "0ms" } as CSSProperties}
          >
            <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">
              Group by
            </span>
            {GROUP_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setGroupBy(key)}
                aria-pressed={groupBy === key}
                className={`rounded-full border px-4 py-1.5 text-[12px] font-medium transition-colors duration-300 active:scale-[0.98] ${
                  groupBy === key
                    ? "border-clay/25 bg-clay/[0.12] text-clay-soft"
                    : "border-border bg-surface text-fg-faint hover:text-fg-muted"
                }`}
              >
                {GROUP_LABELS[key]}
              </button>
            ))}
          </div>

          {groups === null ? (
            <DashboardSkeleton />
          ) : (
            <Panel edge delay={60} className="p-7 sm:p-9">
              <SectionLabel note={`${groups.groups.length} groups`}>
                Sessions by {GROUP_LABELS[groups.groupBy].toLowerCase()}
              </SectionLabel>

              <div className="scroll-slim -mx-1 mt-7 overflow-x-auto px-1">
                <table className="w-full min-w-[620px] border-collapse text-left">
                  <caption className="sr-only">
                    Median health, learning, success and recovery for each group, with the number of
                    sessions each median was taken over
                  </caption>
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                      <th scope="col" className="pb-3 font-medium">
                        {GROUP_LABELS[groups.groupBy]}
                      </th>
                      <th scope="col" className="pb-3 text-right font-medium">
                        Sessions
                      </th>
                      <th scope="col" className="pb-3 text-right font-medium">
                        Health
                      </th>
                      <th scope="col" className="pb-3 text-right font-medium">
                        Learning
                      </th>
                      <th scope="col" className="pb-3 text-right font-medium">
                        Success
                      </th>
                      <th scope="col" className="pb-3 text-right font-medium">
                        Recovery
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {groups.groups.map((group, index) => (
                      <tr
                        key={group.key}
                        className="rise"
                        style={{ "--rise-delay": `${140 + index * 50}ms` } as CSSProperties}
                      >
                        <td
                          className="max-w-[28ch] truncate py-3.5 text-[13px] text-fg"
                          title={group.key}
                        >
                          {group.key}
                        </td>
                        <td className="py-3.5 text-right">
                          <Value className="text-[13px] text-fg-muted">{group.sessions}</Value>
                        </td>
                        <td className="py-3.5 text-right">
                          <Value className="text-[13px] text-fg">{group.health ?? "n/a"}</Value>
                        </td>
                        <td className="py-3.5 text-right">
                          <Value className="text-[13px] text-fg-muted">
                            {group.learning ?? "n/a"}
                          </Value>
                        </td>
                        <td className="py-3.5 text-right">
                          <Value className="text-[13px] text-fg-muted">
                            {percent(group.successRate)}
                          </Value>
                        </td>
                        <td className="py-3.5 text-right">
                          <Value className="text-[13px] text-fg-muted">
                            {percent(group.recoveryRate)}
                          </Value>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-7 border-t border-border pt-6 text-[11px] leading-relaxed text-fg-faint">
                Medians, not means — one long disaster should not define a group. These are
                differences, not causes: two sessions differ in the {groups.groupBy}, the task and
                the day, and a group of one session is a data point rather than a comparison.
                {groups.ungrouped > 0
                  ? ` ${groups.ungrouped} session${groups.ungrouped === 1 ? "" : "s"} had no ${groups.groupBy} and ${groups.ungrouped === 1 ? "was" : "were"} left out.`
                  : ""}
              </p>
            </Panel>
          )}
        </div>
      )}
    </AppShell>
  );
}
