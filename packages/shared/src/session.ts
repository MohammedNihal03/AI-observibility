import { z } from "zod";

import { agentSourceSchema, isoTimestampSchema } from "./events.js";

/**
 * The session model (BUILD.md sections 9 and 51).
 *
 * Two distinct shapes live here, and keeping them apart matters:
 *
 * - `SessionRecord` is what is PERSISTED. It is the sessions table from
 *   section 51: identity, timing and status. Nothing derived.
 * - `Session` is what is SERVED. It is the full section 9 view: the record plus
 *   counters and scores computed from the events.
 *
 * Derived values are never stored on the session row, because a stored
 * aggregate and its source events drift apart the moment one is updated without
 * the other. Counters come from the metrics engine (Phase 4) and scores from
 * the behavior engine (Phase 5).
 */

export const SESSION_STATUSES = ["active", "completed", "aborted"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const sessionStatusSchema = z.enum(SESSION_STATUSES);

/**
 * The four states a session can be classified into (section 22).
 *
 * `insufficient_data` is a first-class answer, not a failure mode: a session
 * with two events is not classified at all.
 */
export const AGENT_STATES = ["improving", "stable", "degrading", "insufficient_data"] as const;
export type AgentState = (typeof AGENT_STATES)[number];
export const agentStateSchema = z.enum(AGENT_STATES);

const nonEmptyString = z.string().min(1);

/** The persisted session row. */
export const sessionRecordSchema = z.object({
  id: nonEmptyString,
  source: agentSourceSchema,
  model: z.string().nullable(),
  /** Optional stated objective, used by goal-drift detection (section 28). */
  goal: z.string().nullable(),
  /** Keywords associated with the goal (section 28). */
  goalKeywords: z.array(z.string()).nullable(),
  startedAt: isoTimestampSchema,
  endedAt: isoTimestampSchema.nullable(),
  status: sessionStatusSchema,
  createdAt: isoTimestampSchema,
});
export type SessionRecord = z.infer<typeof sessionRecordSchema>;

/** What a client may supply when creating a session. */
export const sessionCreateSchema = z.object({
  id: nonEmptyString.optional(),
  source: agentSourceSchema,
  model: z.string().optional(),
  goal: z.string().optional(),
  goalKeywords: z.array(z.string()).optional(),
  startedAt: isoTimestampSchema.optional(),
  status: sessionStatusSchema.optional(),
});
export type SessionCreate = z.infer<typeof sessionCreateSchema>;

/** What may be changed after creation. Identity and start time are immutable. */
export const sessionUpdateSchema = z.object({
  model: z.string().nullable().optional(),
  goal: z.string().nullable().optional(),
  goalKeywords: z.array(z.string()).nullable().optional(),
  endedAt: isoTimestampSchema.nullable().optional(),
  status: sessionStatusSchema.optional(),
});
export type SessionUpdate = z.infer<typeof sessionUpdateSchema>;

/**
 * Counters derived from a session's events (section 9).
 *
 * Computed by the metrics engine in Phase 4, never stored on the session row.
 */
export interface SessionCounters {
  readonly totalEvents: number;
  readonly totalToolCalls: number;
  readonly successfulToolCalls: number;
  readonly failedToolCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly filesRead: number;
  readonly filesModified: number;
  readonly commandsExecuted: number;
  readonly errors: number;
  readonly warnings: number;
}

/**
 * The full section 9 session view: record + derived counters + scores.
 *
 * Every score is nullable. Null means "not computed", which is a real and
 * common answer early in a session - it is never rendered as a zero
 * (sections 22, 29, 30).
 */
export interface Session extends SessionRecord {
  readonly counters: SessionCounters;
  readonly durationMs: number | null;
  /** Null when the model's pricing is unknown. Never estimated (section 30). */
  readonly estimatedCost: number | null;
  readonly healthScore: number | null;
  readonly learningScore: number | null;
  readonly degradationScore: number | null;
  readonly currentState: AgentState;
}
