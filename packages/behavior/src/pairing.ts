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
 *    is exact. Adapters for agents that issue tool calls in PARALLEL should
 *    always supply it - see the trade-off below.
 * 2. **Nearest preceding unmatched action.** Otherwise an outcome is attributed
 *    to the most recent action still awaiting one.
 *
 * ## Why nearest-preceding and not first-in-first-out
 *
 * FIFO looks more correct for a parallel batch - calls A then B, results A then
 * B - and it is. But it breaks badly on the far more common case of an action
 * that never reports an outcome at all: file edits emitted by the generic API,
 * or any collector that records the call and not the result. Those actions sit
 * in the queue forever and every later outcome is attributed to them. On the
 * canonical section 16 session that meant `npm test` failing was credited to a
 * file read, and recovery detection produced zero recoveries for a session that
 * plainly recovered.
 *
 * Nearest-preceding degrades far more gracefully. Its own failure mode is a
 * SWAP WITHIN a parallel batch: results A and B get attached to the wrong one
 * of two calls issued together. The session totals stay right and only the
 * per-signature attribution moves, which is bounded and recoverable - whereas
 * queue poisoning silently invalidates the whole analysis.
 *
 * `pairedBy` records which strategy was used, so nothing downstream mistakes an
 * inference for a fact.
 */

export type PairingStrategy = "call_id" | "nearest_preceding";

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

export function pairActionsWithOutcomes(events: readonly NormalizedAgentEvent[]): PairingResult {
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

    const next = pending.pop();
    if (next === undefined) {
      orphanOutcomes.push(event);
      return;
    }
    resolved.set(next.index, { outcome: event, pairedBy: "nearest_preceding" });
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
export function actionsOf(
  events: readonly NormalizedAgentEvent[],
): readonly NormalizedAgentEvent[] {
  return events.filter(isActionEvent);
}

/** Whether an event modified a file - the "correction" half of a loop. */
export function isModification(event: NormalizedAgentEvent): boolean {
  return event.type === "file_write" || event.type === "file_edit";
}
