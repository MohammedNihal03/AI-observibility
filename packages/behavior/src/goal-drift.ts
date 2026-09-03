import { isActionEvent, type NormalizedAgentEvent } from "@observatory/shared";

/**
 * Goal drift (BUILD.md section 28).
 *
 * Section 28 is candid that this is "important but difficult" and asks for an
 * INTERFACE plus a simple keyword implementation, explicitly not a complicated
 * AI system. That is what this is.
 *
 * ## What the keyword detector can and cannot do
 *
 * It measures lexical overlap between the stated goal and what the agent
 * touched. That is a proxy, and a crude one:
 *
 * - Editing `auth.ts` while the goal says "authentication" scores as related.
 * - Editing `session-store.ts` for the same goal scores as UNRELATED, even
 *   though it plainly is related, unless "session" was given as a keyword.
 * - Reading a config file to understand the problem scores as unrelated, though
 *   it is legitimate investigation.
 *
 * So the signal it feeds is named `possible_goal_drift`, it carries the second
 * smallest weight in the degradation score, and adherence is null whenever no
 * goal was given - which is the common case. A future version can swap in an
 * embedding or LLM detector behind this same interface (section 65, V2).
 */

export interface SessionGoal {
  readonly text: string | null;
  readonly keywords: readonly string[];
}

export interface GoalDriftDetector {
  readonly name: string;
  /**
   * Fraction of actions related to the goal, 0-1.
   *
   * Null when adherence cannot be measured: no goal, no usable keywords, or no
   * actions. Null is not 0 - "we cannot tell" must never render as "completely
   * off task".
   */
  measureAdherence(
    events: readonly NormalizedAgentEvent[],
    goal: SessionGoal,
  ): number | null;
}

/** Words too common to carry meaning as goal keywords. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "than", "that", "this", "these", "those",
  "is", "are", "was", "were", "be", "been", "being", "to", "of", "in", "on", "at", "by", "for",
  "with", "from", "into", "about", "as", "it", "its", "we", "i", "you", "should", "would", "could",
  "can", "will", "make", "made", "do", "does", "did", "get", "got", "fix", "fixes", "fixed",
  "issue", "issues", "problem", "bug", "please", "also", "not", "no", "when", "where", "why",
  "how", "all", "any", "some", "up", "out", "so", "my", "our",
]);

const MIN_KEYWORD_LENGTH = 3;

/**
 * Pulls candidate keywords out of a goal sentence.
 *
 * Stop words and very short tokens are dropped, because "fix the timeout" would
 * otherwise match every action containing "the".
 */
export function extractKeywords(text: string | null): readonly string[] {
  if (text === null || text.trim() === "") return [];
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9_]+/u)
    .filter(
      (token) => token.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(token) && !/^\d+$/u.test(token),
    );
  return [...new Set(tokens)];
}

/** Everything about an action that could mention the goal. */
function searchableText(event: NormalizedAgentEvent): string {
  return [event.signature, event.tool?.name, event.tool?.command, event.files?.path]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
}

export function createKeywordGoalDriftDetector(): GoalDriftDetector {
  return {
    name: "keyword",

    measureAdherence(events, goal) {
      const keywords = [
        ...new Set([...goal.keywords.map((keyword) => keyword.toLowerCase()), ...extractKeywords(goal.text)]),
      ].filter((keyword) => keyword.length >= MIN_KEYWORD_LENGTH);

      if (keywords.length === 0) return null;

      const actions = events.filter(isActionEvent);
      if (actions.length === 0) return null;

      let related = 0;
      for (const action of actions) {
        const haystack = searchableText(action);
        if (keywords.some((keyword) => haystack.includes(keyword))) related += 1;
      }

      return related / actions.length;
    },
  };
}

/** A detector that always answers "unknown". Used when no goal was supplied. */
export const NULL_GOAL_DRIFT_DETECTOR: GoalDriftDetector = {
  name: "none",
  measureAdherence: () => null,
};
