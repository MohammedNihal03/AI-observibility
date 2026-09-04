import {
  analyzeSession,
  computeHealth,
  createKeywordGoalDriftDetector,
  measureWindow,
  signalsFor,
  type BehaviorAnalysis,
} from "@observatory/behavior";
import { computeContextUsage } from "@observatory/metrics";
import {
  isActionEvent,
  isFailure,
  isSuccess,
  type NormalizedAgentEvent,
  type SessionRecord,
  type SessionSnapshot,
  type SessionSummary,
  type SnapshotDetail,
  type TimelineEntry,
  type TrendPoint,
} from "@observatory/shared";

import type { Store } from "./db/store.js";

/**
 * Turns stored events into the payload the dashboard renders (BUILD.md
 * sections 31, 32).
 *
 * Every number here comes from `@observatory/metrics` or
 * `@observatory/behavior`. This module arranges results; it does not compute
 * any of them, so there is no second implementation of a metric to disagree
 * with the first.
 */

/** Points on the progress chart. */
const CHECKPOINTS = 14;
/** Timeline rows served. Older rows stay in the database and in `/events`. */
const TIMELINE_LIMIT = 60;
/** Events read per session. Beyond this the analysis is of the recent window. */
const EVENT_LIMIT = 5000;

export interface SnapshotOptions {
  /** Clock, injected so tests get a stable `computedAt`. */
  readonly now?: () => Date;
}

/* -------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* -------------------------------------------------------------------------- */

function fileLabel(path: string | undefined): string {
  if (path === undefined) return "a file";
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/** One display row per event worth showing. Order is the order it happened. */
export function toTimelineEntry(
  event: NormalizedAgentEvent,
  lastCommand: string,
): TimelineEntry | null {
  const base = { id: event.id, at: event.timestamp };

  switch (event.type) {
    case "session_started":
      return { ...base, kind: "start", label: "Session started", detail: null };
    case "user_message":
      return { ...base, kind: "prompt", label: "Prompt received", detail: null };
    case "file_read":
      return {
        ...base,
        kind: "read",
        label: `Read ${fileLabel(event.files?.path)}`,
        detail: event.files?.path ?? null,
      };
    case "file_edit":
    case "file_write":
      return {
        ...base,
        kind: "edit",
        label: `Edit ${fileLabel(event.files?.path)}`,
        detail: event.files?.path ?? null,
      };
    case "tool_call":
    case "command_started":
    case "test_started":
      return {
        ...base,
        kind: "run",
        label: event.tool?.command ?? event.tool?.name ?? "a command",
        detail: null,
      };
    case "tool_result":
    case "command_finished":
    case "test_finished": {
      const failed = isFailure(event);
      // An outcome that reported neither success nor failure says nothing worth
      // a row - and rendering "unknown" as a failure would be a lie.
      if (!failed && !isSuccess(event)) return null;
      return {
        ...base,
        kind: failed ? "fail" : "pass",
        label: failed ? "Failed" : "Passed",
        detail: event.tool?.command ?? lastCommand,
      };
    }
    case "error":
      return { ...base, kind: "fail", label: "Error", detail: event.tool?.name ?? null };
    case "session_ended":
      return { ...base, kind: "end", label: "Session ended", detail: null };
    default:
      return null;
  }
}

function buildTimeline(events: readonly NormalizedAgentEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let lastCommand = "a command";

  for (const event of events) {
    if (event.type === "tool_call" || event.type === "command_started") {
      lastCommand = event.tool?.command ?? event.tool?.name ?? lastCommand;
    }
    const entry = toTimelineEntry(event, lastCommand);
    if (entry !== null) entries.push(entry);
  }

  return entries;
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Health as the session ran, measured at even intervals.
 *
 * Each point is the engine measuring the session PREFIX up to that action -
 * literally what the dashboard would have shown had it been watching at that
 * moment. The final point therefore equals the headline score: same function,
 * same events.
 */
function buildTrend(
  events: readonly NormalizedAgentEvent[],
  goal: { text: string | null; keywords: readonly string[] } | null,
  contextWindow: number | null,
): TrendPoint[] {
  const actionIndices: number[] = [];
  events.forEach((event, index) => {
    if (isActionEvent(event)) actionIndices.push(index);
  });
  if (actionIndices.length === 0) return [];

  const detector = goal === null ? null : createKeywordGoalDriftDetector();
  const points: TrendPoint[] = [];
  const checkpoints = Math.min(CHECKPOINTS, actionIndices.length);

  for (let checkpoint = 1; checkpoint <= checkpoints; checkpoint += 1) {
    const actionCount = Math.max(1, Math.round((checkpoint / checkpoints) * actionIndices.length));
    const lastAction = actionIndices[actionCount - 1] ?? 0;
    // Take the outcome that follows the action too, so a command and its result
    // are never split across a checkpoint boundary.
    const slice = checkpoint === checkpoints ? events : events.slice(0, lastAction + 2);

    const window = measureWindow(slice, `t${checkpoint}`, 0, slice.length - 1);
    const context =
      contextWindow === null
        ? null
        : computeContextUsage(slice, { reportedMaximum: contextWindow });

    const health = computeHealth({
      recoveryRate: window.recoveryRate,
      toolEfficiency: window.toolEfficiency,
      repetitionRate: window.repetitionRate,
      goalAdherence:
        detector === null || goal === null
          ? null
          : detector.measureAdherence(slice, { text: goal.text, keywords: goal.keywords }),
      contextPressure: context?.utilization ?? null,
    });

    points.push({
      index: checkpoint,
      actions: actionCount,
      health: health.score,
      successRate: window.successRate,
      recoveryRate: window.recoveryRate,
    });
  }

  return points;
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

const HEALTH_COMPONENT_LABELS: Record<string, string> = {
  recovery: "Recovery",
  toolEfficiency: "Tool efficiency",
  repetitionAvoidance: "Repetition avoidance",
  goalAdherence: "Goal adherence",
  contextManagement: "Context headroom",
};

/** True when these events were generated rather than observed (section 34). */
function isSimulated(events: readonly NormalizedAgentEvent[]): boolean {
  return events[0]?.metadata?.["simulated"] === true;
}

/**
 * The context window the agent reported, if any.
 *
 * Read from the session-start event rather than assumed from the model name: an
 * unknown maximum stays unknown, and context pressure stays null (section 29).
 */
function reportedContextWindow(events: readonly NormalizedAgentEvent[]): number | null {
  for (const event of events) {
    const value = event.metadata?.["contextWindow"];
    if (typeof value === "number" && value > 0) return value;
  }
  return null;
}

/**
 * Session-level figures an adapter reported alongside the events.
 *
 * These are read out of event metadata rather than recomputed, because they are
 * observations the adapter made and the engine has no way to re-derive: how many
 * lines a patch touched, how many tokens went to reasoning, whether a command
 * ran out of time. Anything nobody reported stays null - a demo session shows
 * "n/a" for edit volume rather than a zero it never measured.
 */
function buildDetail(events: readonly NormalizedAgentEvent[]): SnapshotDetail {
  let title: string | null = null;
  let added: number | null = null;
  let removed: number | null = null;
  let thinking: number | null = null;
  let cacheRead: number | null = null;
  let cacheCreation: number | null = null;
  let timedOut = 0;

  const add = (total: number | null, value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? (total ?? 0) + value : total;

  for (const event of events) {
    const meta = event.metadata;
    if (meta === null || meta === undefined) continue;

    if (typeof meta["title"] === "string" && meta["title"].length > 0) title = meta["title"];
    added = add(added, meta["linesAdded"]);
    removed = add(removed, meta["linesRemoved"]);
    thinking = add(thinking, meta["thinkingTokens"]);
    cacheRead = add(cacheRead, meta["cacheRead"]);
    cacheCreation = add(cacheCreation, meta["cacheCreation"]);
    if (meta["timedOut"] === true) timedOut += 1;
  }

  /*
   * Reads over everything that went through the cache. Creation is what a first
   * pass had to write; reads are what every later turn got back cheaply, so the
   * ratio is the share of cached context that came for near-free.
   */
  const cacheTotal = (cacheRead ?? 0) + (cacheCreation ?? 0);
  const cacheHitRate = cacheTotal > 0 ? (cacheRead ?? 0) / cacheTotal : null;

  return {
    title,
    linesAdded: added,
    linesRemoved: removed,
    thinkingTokens: thinking,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
    cacheHitRate,
    timedOutCommands: timedOut,
  };
}

export interface AnalyzedSession {
  readonly record: SessionRecord;
  readonly events: readonly NormalizedAgentEvent[];
  readonly analysis: BehaviorAnalysis;
  readonly contextWindow: number | null;
  readonly simulated: boolean;
}

/** Loads a session's events and runs the engine over them. */
export function analyzeStoredSession(store: Store, sessionId: string): AnalyzedSession | undefined {
  const record = store.sessions.get(sessionId);
  if (record === undefined) return undefined;

  const events = store.events.list(sessionId, { limit: EVENT_LIMIT });
  const contextWindow = reportedContextWindow(events);

  const goal =
    record.goal === null && (record.goalKeywords === null || record.goalKeywords.length === 0)
      ? undefined
      : { text: record.goal, keywords: record.goalKeywords ?? [] };

  const analysis = analyzeSession(events, {
    ...(goal !== undefined ? { goal } : {}),
    metrics: { context: { reportedMaximum: contextWindow } },
  });

  return { record, events, analysis, contextWindow, simulated: isSimulated(events) };
}

export function buildSnapshot(
  analyzed: AnalyzedSession,
  options: SnapshotOptions = {},
): SessionSnapshot {
  const { record, events, analysis } = analyzed;
  const now = options.now ?? ((): Date => new Date());

  const goal =
    record.goal === null && (record.goalKeywords === null || record.goalKeywords.length === 0)
      ? null
      : { text: record.goal, keywords: record.goalKeywords ?? [] };

  const timeline = buildTimeline(events);

  return {
    session: {
      id: record.id,
      source: record.source,
      model: record.model,
      goal: record.goal,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      status: record.status,
      durationMs: analysis.metrics.durationMs,
      eventCount: events.length,
      simulated: analyzed.simulated,
      contextWindow: analyzed.contextWindow,
    },
    detail: buildDetail(events),
    scores: {
      health: analysis.health.score,
      healthState: analysis.health.state,
      healthComponents: analysis.health.components.map((component) => ({
        name: HEALTH_COMPONENT_LABELS[component.name] ?? component.name,
        value: component.value,
        weight: component.effectiveWeight,
      })),
      measuredComponents: analysis.health.measuredComponents,
      learning: analysis.learning.score,
      state: analysis.currentState,
      learningDelta: analysis.learning.weightedImprovement,
      degradation: analysis.degradation.score,
    },
    metrics: analysis.metrics,
    windows: analysis.windows.windows.map((window) => ({
      label: window.label,
      actions: window.actions,
      errorRate: window.errorRate,
      recoveryRate: window.recoveryRate,
      repetitionRate: window.repetitionRate,
      goalAdherence: window.goalAdherence,
    })),
    trend: buildTrend(events, goal, analyzed.contextWindow),
    reasons: analysis.reasons,
    signals: signalsFor(record.id, analysis)
      .map((signal) => ({
        type: signal.type,
        severity: signal.severity,
        message: signal.message,
      }))
      .slice(0, 10),
    timeline: timeline.slice(-TIMELINE_LIMIT),
    computedAt: now().toISOString(),
  };
}

/** The cheap row for `GET /api/sessions`: identity plus the headline scores. */
export function buildSummary(analyzed: AnalyzedSession): SessionSummary {
  const { record, analysis } = analyzed;
  return {
    id: record.id,
    source: record.source,
    model: record.model,
    goal: record.goal,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    status: record.status,
    simulated: analyzed.simulated,
    eventCount: analyzed.events.length,
    health: analysis.health.score,
    learning: analysis.learning.score,
    state: analysis.currentState,
  };
}
