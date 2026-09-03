import {
  agentEventInputSchema,
  agentEventSchema,
  normalizedAgentEventSchema,
  type AgentEvent,
  type AgentEventInput,
  type NormalizedAgentEvent,
} from "@observatory/shared";

import { EventValidationError } from "./errors.js";

/**
 * Step 1 of the pipeline (BUILD.md section 10): validation.
 *
 * Input reaching here is untrusted - it comes from an HTTP body or from a
 * transcript file written by another program. Nothing downstream may assume a
 * shape that has not passed through this module.
 */

/** Parses an incoming event payload. Throws `EventValidationError` on failure. */
export function parseEventInput(raw: unknown): AgentEventInput {
  const result = agentEventInputSchema.safeParse(raw);
  if (!result.success) throw EventValidationError.fromZodError(result.error);
  return result.data;
}

/** Non-throwing variant, for collectors tailing files that may contain junk. */
export function tryParseEventInput(
  raw: unknown,
): { ok: true; event: AgentEventInput } | { ok: false; error: EventValidationError } {
  const result = agentEventInputSchema.safeParse(raw);
  return result.success
    ? { ok: true, event: result.data }
    : { ok: false, error: EventValidationError.fromZodError(result.error) };
}

/** Parses a complete event (id, sessionId and timestamp all present). */
export function parseAgentEvent(raw: unknown): AgentEvent {
  const result = agentEventSchema.safeParse(raw);
  if (!result.success) throw EventValidationError.fromZodError(result.error);
  return result.data;
}

/** Parses an event that has already been through normalization. */
export function parseNormalizedEvent(raw: unknown): NormalizedAgentEvent {
  const result = normalizedAgentEventSchema.safeParse(raw);
  if (!result.success) throw EventValidationError.fromZodError(result.error);
  return result.data;
}
