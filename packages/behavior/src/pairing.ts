import {
  isActionEvent,
  isFailure,
  isOutcomeEvent,
  isSuccess,
  type NormalizedAgentEvent,
} from "@observatory/shared";

/**
 * Pairing actions with their outcomes.
 *
 * Everything else in this package depends on knowing which result belongs to
 * which call: a failure is only "recovered" if a LATER attempt at the same
 * action succeeded, and blind repetition is only distinguishable from a healthy
 * correction loop by what happened between the two attempts.
 *
 * Two pairing strategies, in order of trustworthiness:
 *
 * 1. **By call id.** When an adapter records the agent's own identifier (Claude
 *    Code has `tool_use_id`, Codex has `call_id`) in `metadata.callId`, pairing
 *    is exact.
 * 2. **By arrival order.** Otherwise, outcomes are matched to the oldest
 *    unmatched action - FIFO, not LIFO. Agents issue tool calls in parallel and
 *    the results come back in the order they were requested, so a stack would
 *    pair call A with result B.
 *
 * The fallback is a heuristic and is labelled as one: `pairedBy` records which
 * strategy was used, so nothing downstream mistakes an inference for a fact.
 */

export type PairingStrategy = "call_id" | "arrival_order";

export interface ActionOutcome {
  readonly action: NormalizedAgentEvent;
  /** Index of the action in the source array, for windowing and ordering. */
  readonly index: number;
  readonly outcome: NormalizedAgentEvent | undefined;
  readonly pairedBy: PairingStrategy | undefined;
  /**
   * True if the action failed, false if it succeeded, null if unknown.
   *
   * Null is common and must stay distinct from false: an action whose result
   * was never recorded did not succeed, but it did not fail either.
   */
  readonly failed: boolean | null;
}

function callIdOf(event: NormalizedAgentEvent): string | undefined {
  const value = event.metadata?.["callId"];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * An outcome event that carries its own failure state is self-describing, so an
 * unpaired outcome still contributes to failure counts.
 */
export interface PairingResult {
  readonly pairs: readonly ActionOutcome[];
  /** Outcome events that could not be attributed to any action. */
  readonly orphanOutcomes: readonly NormalizedAgentEvent[];
}

export function pairActionsWithOutcomes(
  events: readonly NormalizedAgentEvent[],
): PairingResult {
  const pending: { action: NormalizedAgentEvent; index: number }[] = [];
  const byCallId = new Map<string, { action: NormalizedAgentEvent; index: number }>();
  const resolved = new Map<number, { outcome: NormalizedAgentEvent; pairedBy: PairingStrategy }>();
  const actions: { action: NormalizedAgentEvent; index: number }[] = [];
  const orphanOutcomes: NormalizedAgentEvent[] = [];

  events.forEach((event, index) => {
    if (isActionEvent(event)) {
      const entry = { action: event, index };
      actions.push(entry);
      pending.push(entry);
      const callId = callIdOf(event);
      if (callId !== undefined) byCallId.set(callId, entry);
      return;
    }

    if (!isOutcomeEvent(event)) return;

    const callId = callIdOf(event);
    if (callId !== undefined) {
      const match = byCallId.get(callId);
      if (match !== undefined && !resolved.has(match.index)) {
        resolved.set(match.index, { outcome: event, pairedBy: "call_id" });
        byCallId.delete(callId);
        const position = pending.findIndex((entry) => entry.index === match.index);
        if (position >= 0) pending.splice(position, 1);
        return;
      }
    }

    const next = pending.shift();
    if (next === undefined) {
      orphanOutcomes.push(event);
      return;
    }
    resolved.set(next.index, { outcome: event, pairedBy: "arrival_order" });
  });

  const pairs = actions.map(({ action, index }): ActionOutcome => {
    const match = resolved.get(index);
    if (match === undefined) {
      // An action can report its own result inline, without a separate outcome
      // event - the generic API allows it, and demo scenarios use it.
      const inline = action.result !== undefined ? outcomeOf(action) : null;
      return { action, index, outcome: undefined, pairedBy: undefined, failed: inline };
    }
    return {
      action,
      index,
      outcome: match.outcome,
      pairedBy: match.pairedBy,
      failed: outcomeOf(match.outcome),
    };
  });

  return { pairs, orphanOutcomes };
}

function outcomeOf(event: NormalizedAgentEvent): boolean | null {
  if (isFailure(event)) return true;
  if (isSuccess(event)) return false;
  return null;
}

/** Actions in the order they occurred. */
export function actionsOf(events: readonly NormalizedAgentEvent[]): readonly NormalizedAgentEvent[] {
  return events.filter(isActionEvent);
}

/** Whether an event modified a file - the "correction" half of a loop. */
export function isModification(event: NormalizedAgentEvent): boolean {
  return event.type === "file_write" || event.type === "file_edit";
}
