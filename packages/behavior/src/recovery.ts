import type { NormalizedAgentEvent } from "@observatory/shared";

import { isModification, type ActionOutcome } from "./pairing.js";

/**
 * Recovery and correction loops (BUILD.md sections 16, 17, 18).
 *
 * The central judgement of the whole product lives here. Section 16:
 *
 *   npm test -> fail -> inspect -> edit -> npm test -> pass    healthy
 *   npm test -> fail -> npm test -> fail -> npm test -> fail   degrading
 *
 * Both contain repeated failures of the same command. What separates them is
 * whether the agent CHANGED SOMETHING in between. That is the only signal
 * needed to tell adaptation from thrashing, and it is fully deterministic.
 *
 * ## Failures are grouped into episodes
 *
 * Three consecutive failures of `npm test` are one episode, not three. Counting
 * them individually would let recovery rate look terrible for a session that
 * thrashed once and then fixed the problem - and thrashing is already penalised
 * separately as `repeatedFailedActions`. Section 18's ratio is therefore
 * recovered episodes over episodes.
 */

export interface FailureEpisode {
  readonly signature: string;
  /** Index of the first failing attempt. */
  readonly startIndex: number;
  /** Index of the last failing attempt before resolution or the session end. */
  readonly endIndex: number;
  readonly attempts: number;
  /** Index of the attempt that finally succeeded, if one did. */
  readonly recoveredAtIndex: number | null;
  /** A file was modified between the failure and the successful retry. */
  readonly modifiedBetween: boolean;
  /**
   * Retries with no intervening modification - the agent tried the identical
   * thing again without changing anything (section 16).
   */
  readonly blindRetries: number;
}

export interface RecoveryResult {
  /** Failure episodes, the denominator of recovery rate. */
  readonly failures: number;
  /** Episodes that ended in a success of the same action. */
  readonly recoveries: number;
  /** Individual failed attempts, which can exceed `failures`. */
  readonly failureEvents: number;
  readonly episodes: readonly FailureEpisode[];
  /** Episodes still unresolved when the session data ends. */
  readonly unresolvedFailures: number;
}

export interface CorrectionLoopResult {
  /** failure -> modification -> retry sequences (section 17). */
  readonly correctionLoops: number;
  readonly successfulCorrectionLoops: number;
  readonly failedCorrectionLoops: number;
  /**
   * failure -> retry with NO modification in between. Not a correction loop at
   * all: nothing was corrected (section 16).
   */
  readonly blindRetries: number;
}

export const EMPTY_RECOVERY: RecoveryResult = {
  failures: 0,
  recoveries: 0,
  failureEvents: 0,
  episodes: [],
  unresolvedFailures: 0,
};

export const EMPTY_CORRECTION_LOOPS: CorrectionLoopResult = {
  correctionLoops: 0,
  successfulCorrectionLoops: 0,
  failedCorrectionLoops: 0,
  blindRetries: 0,
};

interface OpenEpisode {
  signature: string;
  startIndex: number;
  endIndex: number;
  attempts: number;
  modifiedSinceLastAttempt: boolean;
  modifiedDuringEpisode: boolean;
  blindRetries: number;
  correctionLoops: number;
  failedCorrectionLoops: number;
}

/**
 * Walks the session once, tracking an open failure episode per action
 * signature, and closes an episode when that same action later succeeds.
 *
 * `events` is needed alongside `pairs` because modifications are not actions
 * with outcomes - they are the thing that happens BETWEEN a failure and a
 * retry, and their position in the full event stream is what makes a loop a
 * loop.
 */
export function analyzeRecovery(
  events: readonly NormalizedAgentEvent[],
  pairs: readonly ActionOutcome[],
): { recovery: RecoveryResult; loops: CorrectionLoopResult } {
  if (pairs.length === 0) {
    return { recovery: EMPTY_RECOVERY, loops: EMPTY_CORRECTION_LOOPS };
  }

  // Modification indices, so "was anything changed between i and j" is a
  // straightforward range question.
  const modificationIndices: number[] = [];
  events.forEach((event, index) => {
    if (isModification(event)) modificationIndices.push(index);
  });

  const modifiedBetween = (from: number, to: number): boolean =>
    modificationIndices.some((index) => index > from && index < to);

  const open = new Map<string, OpenEpisode>();
  const episodes: FailureEpisode[] = [];

  let failureEvents = 0;
  let correctionLoops = 0;
  let successfulCorrectionLoops = 0;
  let failedCorrectionLoops = 0;
  let blindRetries = 0;

  for (const pair of pairs) {
    const signature = pair.action.signature;
    const existing = open.get(signature);

    if (pair.failed === true) {
      failureEvents += 1;

      if (existing === undefined) {
        open.set(signature, {
          signature,
          startIndex: pair.index,
          endIndex: pair.index,
          attempts: 1,
          modifiedSinceLastAttempt: false,
          modifiedDuringEpisode: false,
          blindRetries: 0,
          correctionLoops: 0,
          failedCorrectionLoops: 0,
        });
        continue;
      }

      // A retry that also failed.
      const changed = modifiedBetween(existing.endIndex, pair.index);
      if (changed) {
        // Something was corrected and it still failed: a failed correction
        // loop (section 17), which is different from blind repetition.
        correctionLoops += 1;
        failedCorrectionLoops += 1;
        existing.correctionLoops += 1;
        existing.failedCorrectionLoops += 1;
        existing.modifiedDuringEpisode = true;
      } else {
        blindRetries += 1;
        existing.blindRetries += 1;
      }
      existing.attempts += 1;
      existing.endIndex = pair.index;
      continue;
    }

    if (pair.failed === false && existing !== undefined) {
      // The same action finally succeeded: the episode is recovered.
      const changed = modifiedBetween(existing.endIndex, pair.index);
      if (changed) {
        correctionLoops += 1;
        successfulCorrectionLoops += 1;
        existing.modifiedDuringEpisode = true;
      } else {
        // Succeeded on a retry with nothing changed. Flaky test, transient
        // network, race - real and worth recording, but not a correction.
        blindRetries += 1;
        existing.blindRetries += 1;
      }

      episodes.push({
        signature,
        startIndex: existing.startIndex,
        endIndex: existing.endIndex,
        attempts: existing.attempts,
        recoveredAtIndex: pair.index,
        modifiedBetween: existing.modifiedDuringEpisode || changed,
        blindRetries: existing.blindRetries,
      });
      open.delete(signature);
    }
  }

  // Episodes never resolved by the end of the data.
  for (const episode of open.values()) {
    episodes.push({
      signature: episode.signature,
      startIndex: episode.startIndex,
      endIndex: episode.endIndex,
      attempts: episode.attempts,
      recoveredAtIndex: null,
      modifiedBetween: episode.modifiedDuringEpisode,
      blindRetries: episode.blindRetries,
    });
  }

  episodes.sort((a, b) => a.startIndex - b.startIndex);

  const recoveries = episodes.filter((episode) => episode.recoveredAtIndex !== null).length;

  return {
    recovery: {
      failures: episodes.length,
      recoveries,
      failureEvents,
      episodes,
      unresolvedFailures: episodes.length - recoveries,
    },
    loops: {
      correctionLoops,
      successfulCorrectionLoops,
      failedCorrectionLoops,
      blindRetries,
    },
  };
}
