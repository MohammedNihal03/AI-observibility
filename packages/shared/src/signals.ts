import { z } from "zod";

import { isoTimestampSchema } from "./events.js";

/**
 * Behavioral signals (BUILD.md sections 15, 23, 51).
 *
 * A signal is an observation the engine made about the session - "this command
 * has now failed three times" - recorded with a timestamp so the dashboard can
 * show what happened and when.
 *
 * Signals are evidence, not conclusions. `high_context_pressure` records that
 * context usage is high; it does not assert that context usage caused anything
 * (section 23).
 */

export const SIGNAL_TYPES = [
  // Repetition (sections 15, 16)
  "repeated_action_detected",
  "repeated_failed_action",
  // V2 (section 65): the same APPROACH repeated, across different targets.
  "repeated_strategy",
  // Recovery and correction (sections 17, 18)
  "correction_loop_completed",
  "recovery_succeeded",
  "recovery_failed",
  // Degradation signals (section 23)
  "increasing_error_rate",
  "increasing_correction_loops",
  "declining_recovery_rate",
  "increasing_tool_waste",
  "possible_goal_drift",
  "high_context_pressure",
  // Positive trend signals (section 19)
  "error_rate_improved",
  "recovery_rate_improved",
  "repetition_reduced",
  "tool_efficiency_improved",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];
export const signalTypeSchema = z.enum(SIGNAL_TYPES);

export const SIGNAL_SEVERITIES = ["info", "warning", "critical"] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];
export const signalSeveritySchema = z.enum(SIGNAL_SEVERITIES);

const nonEmptyString = z.string().min(1);

export const signalRecordSchema = z.object({
  id: nonEmptyString,
  sessionId: nonEmptyString,
  timestamp: isoTimestampSchema,
  type: signalTypeSchema,
  severity: signalSeveritySchema,
  /** Human-readable, generated from real measurements. Never hand-written prose. */
  message: nonEmptyString,
  metadata: z.record(z.string(), z.unknown()).nullable(),
});
export type SignalRecord = z.infer<typeof signalRecordSchema>;

export const signalCreateSchema = z.object({
  id: nonEmptyString.optional(),
  sessionId: nonEmptyString,
  timestamp: isoTimestampSchema.optional(),
  type: signalTypeSchema,
  severity: signalSeveritySchema,
  message: nonEmptyString,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SignalCreate = z.infer<typeof signalCreateSchema>;

/**
 * An explanation attached to a score (section 27).
 *
 * Every score returns a list of these. A score without reasons is a bug: the
 * product must never show `Health = 62` and stop there.
 */
export const REASON_KINDS = ["positive", "neutral", "warning", "negative"] as const;
export type ReasonKind = (typeof REASON_KINDS)[number];
export const reasonKindSchema = z.enum(REASON_KINDS);

export const reasonSchema = z.object({
  type: reasonKindSchema,
  message: nonEmptyString,
  /** The metric this reason was derived from, so a claim can be traced back. */
  metric: z.string().optional(),
  /** The measured change that justifies the message, where one applies. */
  delta: z.number().optional(),
});
export type Reason = z.infer<typeof reasonSchema>;
