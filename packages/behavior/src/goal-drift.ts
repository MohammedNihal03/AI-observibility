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
  measureAdherence(events: readonly NormalizedAgentEvent[], goal: SessionGoal): number | null;
}

/** Words too common to carry meaning as goal keywords. */
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "than",
  "that",
  "this",
  "these",
  "those",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "from",
  "into",
  "about",
  "as",
  "it",
  "its",
  "we",
  "i",
  "you",
  "should",
  "would",
  "could",
  "can",
  "will",
  "make",
  "made",
  "do",
  "does",
  "did",
  "get",
  "got",
  "fix",
  "fixes",
  "fixed",
  "issue",
  "issues",
  "problem",
  "bug",
  "please",
  "also",
  "not",
  "no",
  "when",
  "where",
  "why",
  "how",
  "all",
  "any",
  "some",
  "up",
  "out",
  "so",
  "my",
  "our",
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
      (token) =>
        token.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(token) && !/^\d+$/u.test(token),
    );
  return [...new Set(tokens)];
}

/**
 * Everything about an action that could mention the goal.
 *
 * Case is PRESERVED. Lowercasing here destroyed the camelCase boundaries the
 * tokenizer splits on, so `authTokens.ts` became one opaque word and never
 * matched a goal that said "authentication". Each detector lowercases at the
 * point it actually compares.
 */
function searchableText(event: NormalizedAgentEvent): string {
  return [event.signature, event.tool?.name, event.tool?.command, event.files?.path]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

/* -------------------------------------------------------------------------- */
/* Token matching (section 65, V2)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Splits text into words, including inside identifiers.
 *
 * `src/auth/tokenRefresh.test.ts` becomes
 * `src auth token refresh test ts` - paths and camelCase carry most of the
 * vocabulary an agent works with, and substring matching could not see into
 * either.
 */
export function tokenize(text: string): readonly string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(token));
}

/**
 * Crude suffix stripping, so `tests` and `test`, or `authentication` and
 * `authenticate`, reduce to a common form.
 *
 * Not a real stemmer. A Porter implementation would be a hundred lines to buy
 * accuracy this measure cannot use: the result feeds a signal named "possible
 * goal drift" that carries 10% of the degradation weight.
 */
export function stem(token: string): string {
  for (const suffix of ["ations", "ation", "ings", "ing", "ers", "er", "ed", "es", "s"]) {
    if (token.length - suffix.length >= 4 && token.endsWith(suffix)) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}

/** Shortest prefix that may stand in for a longer word: `auth` for `authentication`. */
const MIN_PREFIX = 4;

/**
 * Whether two tokens refer to the same thing, as far as this can tell.
 *
 * Equality after stemming, or one being a prefix of the other. The prefix rule
 * is what connects a goal that says "authentication" to a file called
 * `auth.ts`, which is the single most common way a real goal relates to a real
 * path and which substring matching got backwards - it could find "auth" inside
 * "authentication", but never the reverse.
 */
function tokensMatch(goalToken: string, actionToken: string): boolean {
  if (goalToken === actionToken) return true;

  const left = stem(goalToken);
  const right = stem(actionToken);
  if (left === right) return true;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.length >= MIN_PREFIX && longer.startsWith(shorter);
}

/**
 * The default detector: token matching with stem and prefix tolerance.
 *
 * A step up from substring matching, and honestly still not semantic. It knows
 * that `authentication` and `auth.ts` are related because one word starts the
 * other. It does not know that `login` and `session-store` are related, because
 * nothing short of a model does. `GoalDriftDetector` stays an interface so that
 * a future embedding backend can answer that question without any other module
 * changing.
 */
export function createTokenGoalDriftDetector(): GoalDriftDetector {
  return {
    name: "token",

    measureAdherence(events, goal) {
      const goalTokens = [
        ...new Set([
          ...goal.keywords.flatMap((keyword) => tokenize(keyword)),
          ...tokenize(goal.text ?? ""),
        ]),
      ];

      if (goalTokens.length === 0) return null;

      const actions = events.filter(isActionEvent);
      if (actions.length === 0) return null;

      let related = 0;
      for (const action of actions) {
        const actionTokens = tokenize(searchableText(action));
        const matched = actionTokens.some((actionToken) =>
          goalTokens.some((goalToken) => tokensMatch(goalToken, actionToken)),
        );
        if (matched) related += 1;
      }

      // Same rule as the keyword detector: nothing matching anywhere is much
      // more often a poor goal string than an agent that ignored its task.
      if (related === 0) return null;

      return related / actions.length;
    },
  };
}

/**
 * The original substring detector.
 *
 * Kept exported so the two can be compared on a real session, and because a
 * caller that wants the older, stricter behaviour should be able to ask for it
 * by name rather than by pinning a version.
 */
export function createKeywordGoalDriftDetector(): GoalDriftDetector {
  return {
    name: "keyword",

    measureAdherence(events, goal) {
      const keywords = [
        ...new Set([
          ...goal.keywords.map((keyword) => keyword.toLowerCase()),
          ...extractKeywords(goal.text),
        ]),
      ].filter((keyword) => keyword.length >= MIN_KEYWORD_LENGTH);

      if (keywords.length === 0) return null;

      const actions = events.filter(isActionEvent);
      if (actions.length === 0) return null;

      let related = 0;
      for (const action of actions) {
        const haystack = searchableText(action).toLowerCase();
        if (keywords.some((keyword) => haystack.includes(keyword))) related += 1;
      }

      // Not one action out of hundreds mentioned the goal. Two explanations
      // fit: the agent ignored its task entirely, or the goal text is a poor
      // source of keywords. The second is far more common - real prompts are
      // typed in a hurry and contain typos - and the detector cannot tell them
      // apart, so it reports "cannot tell" rather than "completely off task".
      //
      // Measured on a real Claude Code session whose first message was
      // "go witht the ohase 6": every keyword was a typo, nothing matched, and
      // a fabricated 0% took roughly 18 points off a health score through the
      // goalAdherence component. Partial matching still measures normally, so
      // genuine drift within a session is unaffected.
      if (related === 0) return null;

      return related / actions.length;
    },
  };
}

/** A detector that always answers "unknown". Used when no goal was supplied. */
export const NULL_GOAL_DRIFT_DETECTOR: GoalDriftDetector = {
  name: "none",
  measureAdherence: () => null,
};
