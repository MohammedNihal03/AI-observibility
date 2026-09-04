import type { AgentState, SessionStatus } from "./session.js";
import type { AgentSource } from "./events.js";
import type { SessionMetrics } from "./metrics.js";
import type { HealthState } from "./scoring.js";
import type { Reason, SignalSeverity, SignalType } from "./signals.js";

/**
 * What the API serves and the dashboard renders (BUILD.md sections 31, 32).
 *
 * This is the seam between the two halves of the product. The server owns every
 * calculation - it holds the events, and the analytics engine runs beside it -
 * and the dashboard owns every pixel. Neither reaches across.
 *
 * The types live in `shared` rather than in the server because both sides need
 * them and neither should import the other. They are types only: no zod schema,
 * because the server constructs these values from its own engine rather than
 * parsing them from an untrusted source.
 */

/** One point on the session-progress chart. */
export interface TrendPoint {
  readonly index: number;
  /** Actions completed by this point in the session. */
  readonly actions: number;
  /** Health as it stood here, 0-100. Null while it is not yet measurable. */
  readonly health: number | null;
  readonly successRate: number | null;
  readonly recoveryRate: number | null;
}

export type TimelineKind = "start" | "prompt" | "read" | "edit" | "run" | "pass" | "fail" | "end";

export interface TimelineEntry {
  readonly id: string;
  /** ISO 8601. The client formats it; the server does not guess a timezone. */
  readonly at: string;
  readonly kind: TimelineKind;
  readonly label: string;
  readonly detail: string | null;
}

export interface SnapshotWindow {
  readonly label: string;
  readonly actions: number;
  readonly errorRate: number | null;
  readonly recoveryRate: number | null;
  readonly repetitionRate: number | null;
  readonly goalAdherence: number | null;
}

export interface HealthComponentView {
  readonly name: string;
  /** 0-1, higher is better. Null when it could not be measured. */
  readonly value: number | null;
  /** Weight after renormalising over measured components. 0 means excluded. */
  readonly weight: number;
}

export interface SnapshotScores {
  readonly health: number | null;
  readonly healthState: HealthState | "insufficient_data";
  readonly healthComponents: readonly HealthComponentView[];
  readonly measuredComponents: number;
  readonly learning: number | null;
  readonly state: AgentState;
  /** Weighted improvement in rate units, before the 0-100 mapping. */
  readonly learningDelta: number | null;
  readonly degradation: number | null;
}

/**
 * Figures an adapter may supply beyond the core metrics.
 *
 * Every field is nullable, and null means the adapter did not report it rather
 * than zero. A simulated session has no diff to count and no thinking tokens to
 * report, and showing "0 lines changed" for one would be a measurement it never
 * made.
 */
export interface SnapshotDetail {
  /** The agent's own title for the session, when it generated one. */
  readonly title: string | null;
  readonly linesAdded: number | null;
  readonly linesRemoved: number | null;
  /** Reasoning tokens. Already counted inside output tokens, never added twice. */
  readonly thinkingTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheCreationTokens: number | null;
  /** Cached reads over all cached tokens, 0-1. The cost lever. */
  readonly cacheHitRate: number | null;
  /** Commands that ran out of time. Counted as failures, not successes. */
  readonly timedOutCommands: number;
}

export interface SnapshotSession {
  readonly id: string;
  readonly source: AgentSource;
  readonly model: string | null;
  readonly goal: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly status: SessionStatus;
  readonly durationMs: number | null;
  readonly eventCount: number;
  /**
   * True when the events came from the demo generator rather than an agent.
   *
   * Derived from the events themselves, which carry `metadata.simulated`, so a
   * simulated session cannot lose the label somewhere between the generator and
   * the screen (section 34).
   */
  readonly simulated: boolean;
  /** Context window the agent reported, when it reported one. */
  readonly contextWindow: number | null;
}

export interface SnapshotSignal {
  readonly type: SignalType;
  readonly severity: SignalSeverity;
  readonly message: string;
}

/** Everything the dashboard needs for one session, in one payload. */
export interface SessionSnapshot {
  readonly session: SnapshotSession;
  readonly detail: SnapshotDetail;
  readonly scores: SnapshotScores;
  readonly metrics: SessionMetrics;
  readonly windows: readonly SnapshotWindow[];
  readonly trend: readonly TrendPoint[];
  readonly reasons: readonly Reason[];
  readonly signals: readonly SnapshotSignal[];
  readonly timeline: readonly TimelineEntry[];
  /** When the server computed this, ISO 8601. */
  readonly computedAt: string;
}

/** One row of `GET /api/sessions`. */
export interface SessionSummary {
  readonly id: string;
  readonly source: AgentSource;
  readonly model: string | null;
  readonly goal: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly status: SessionStatus;
  readonly simulated: boolean;
  readonly eventCount: number;
  readonly health: number | null;
  readonly learning: number | null;
  readonly state: AgentState;
}

/* -------------------------------------------------------------------------- */
/* WebSocket protocol (section 31)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Messages pushed over `WS /api/sessions/:id/stream`.
 *
 * `snapshot` carries the whole recomputed view rather than a diff. The payload
 * is a few kilobytes on a local socket, and a diff protocol would put a second
 * implementation of "what the numbers are" in the client - which is exactly the
 * kind of drift this codebase keeps refusing to introduce.
 *
 * `event` rides alongside it so the timeline can animate the individual arrival
 * that caused the recomputation.
 */
export type StreamMessage =
  | { readonly type: "hello"; readonly sessionId: string; readonly snapshot: SessionSnapshot }
  | { readonly type: "event"; readonly sessionId: string; readonly entry: TimelineEntry }
  | { readonly type: "snapshot"; readonly sessionId: string; readonly snapshot: SessionSnapshot }
  | { readonly type: "session_ended"; readonly sessionId: string }
  | { readonly type: "error"; readonly message: string };
