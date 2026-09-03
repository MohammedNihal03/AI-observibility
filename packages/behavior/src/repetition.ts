import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "@observatory/shared";

import type { ActionOutcome } from "./pairing.js";

/**
 * Repetition detection (BUILD.md sections 15, 16).
 *
 * Normalized string comparison over action signatures. No embeddings, no LLM -
 * section 15 rules both out for the MVP, and a deterministic comparison is what
 * lets the same session always produce the same repetition count (section 57).
 *
 * The distinction that matters most (section 16): a repeated action is not
 * automatically bad. Running the tests again after fixing something is correct
 * behavior. Running them again after changing NOTHING is the degradation
 * signal. That difference is `repeatedFailedActions` and
 * `longestConsecutiveFailureRun`, not `repeatedActions`.
 */

export interface RepeatedSignature {
  readonly signature: string;
  readonly occurrences: number;
  /** occurrences - 1: the first time is never a repeat. */
  readonly repeats: number;
  readonly failures: number;
  /** Longest run of back-to-back failures of this exact action. */
  readonly longestFailureRun: number;
  /** Indices of the repeated occurrences, for the timeline. */
  readonly indices: readonly number[];
}

/**
 * Whether a signature identifies WHAT the action operated on.
 *
 * `tool_call|tool:Grep` does not: every Grep in the session shares it, so two
 * unrelated searches are indistinguishable from the same search run twice. A
 * signature carrying a command, a path or a target does identify its subject.
 *
 * Actions without a discriminator are excluded from the repetition measure
 * entirely rather than assumed identical. On a real session, assuming they were
 * identical reported 60% repetition and "repetition increased 414%" for
 * fourteen genuinely different searches.
 */
export function isDiscriminating(signature: string): boolean {
  return signature.includes("|cmd:") || signature.includes("|path:") || signature.includes("|target:");
}

export interface RepetitionResult {
  /**
   * Actions repetition could actually be measured over. This is the denominator
   * of the repetition rate - not the total action count, which would include
   * actions we cannot tell apart.
   */
  readonly totalActions: number;
  /** Actions skipped because their signature identifies no subject. */
  readonly unmeasurableActions: number;
  /** Actions that repeated something already done. Excludes first occurrences. */
  readonly repeatedActions: number;
  /** Failed actions whose signature had already failed before. */
  readonly repeatedFailedActions: number;
  readonly distinctSignatures: number;
  /** Signatures seen more than `minOccurrences` times, worst first. */
  readonly repeatedSignatures: readonly RepeatedSignature[];
  /**
   * The worst back-to-back failure run of any single action.
   *
   * Section 16's example - npm test failing three times in a row - shows up
   * here as 3, and this is what the degradation signal keys off.
   */
  readonly longestConsecutiveFailureRun: number;
}

export const EMPTY_REPETITION: RepetitionResult = {
  totalActions: 0,
  unmeasurableActions: 0,
  repeatedActions: 0,
  repeatedFailedActions: 0,
  distinctSignatures: 0,
  repeatedSignatures: [],
  longestConsecutiveFailureRun: 0,
};

interface Tally {
  occurrences: number;
  failures: number;
  currentFailureRun: number;
  longestFailureRun: number;
  indices: number[];
  hasFailedBefore: boolean;
}

export function detectRepetition(
  pairs: readonly ActionOutcome[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): RepetitionResult {
  if (pairs.length === 0) return EMPTY_REPETITION;

  const tallies = new Map<string, Tally>();
  let repeatedActions = 0;
  let repeatedFailedActions = 0;
  let measurableActions = 0;
  let unmeasurableActions = 0;

  for (const pair of pairs) {
    const signature = pair.action.signature;

    if (!isDiscriminating(signature)) {
      unmeasurableActions += 1;
      continue;
    }
    measurableActions += 1;

    const existing = tallies.get(signature);

    const tally: Tally = existing ?? {
      occurrences: 0,
      failures: 0,
      currentFailureRun: 0,
      longestFailureRun: 0,
      indices: [],
      hasFailedBefore: false,
    };

    if (existing === undefined) tallies.set(signature, tally);
    else repeatedActions += 1;

    tally.occurrences += 1;
    tally.indices.push(pair.index);

    if (pair.failed === true) {
      // Counted before the run is extended, so the FIRST failure of a
      // signature is never a "repeated failure".
      if (tally.hasFailedBefore) repeatedFailedActions += 1;
      tally.hasFailedBefore = true;
      tally.failures += 1;
      tally.currentFailureRun += 1;
      if (tally.currentFailureRun > tally.longestFailureRun) {
        tally.longestFailureRun = tally.currentFailureRun;
      }
    } else if (pair.failed === false) {
      // Only a confirmed success breaks a failure run. An unknown outcome
      // leaves the run intact rather than silently forgiving it.
      tally.currentFailureRun = 0;
    }
  }

  const repeatedSignatures: RepeatedSignature[] = [];
  let longestConsecutiveFailureRun = 0;

  for (const [signature, tally] of tallies) {
    if (tally.longestFailureRun > longestConsecutiveFailureRun) {
      longestConsecutiveFailureRun = tally.longestFailureRun;
    }
    if (tally.occurrences >= config.repetition.minOccurrences) {
      repeatedSignatures.push({
        signature,
        occurrences: tally.occurrences,
        repeats: tally.occurrences - 1,
        failures: tally.failures,
        longestFailureRun: tally.longestFailureRun,
        indices: tally.indices,
      });
    }
  }

  repeatedSignatures.sort(
    (a, b) =>
      b.longestFailureRun - a.longestFailureRun ||
      b.failures - a.failures ||
      b.occurrences - a.occurrences ||
      a.signature.localeCompare(b.signature),
  );

  return {
    totalActions: measurableActions,
    unmeasurableActions,
    repeatedActions,
    repeatedFailedActions,
    distinctSignatures: tallies.size,
    repeatedSignatures,
    longestConsecutiveFailureRun,
  };
}
