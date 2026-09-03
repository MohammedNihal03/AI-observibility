import type { NormalizedAgentEvent } from "@observatory/shared";
import { describe, expect, it } from "vitest";

import {
  createKeywordGoalDriftDetector,
  createTokenGoalDriftDetector,
  stem,
  tokenize,
} from "./goal-drift.js";

/**
 * Goal drift (BUILD.md section 28; the token detector is section 65, V2).
 *
 * The comparisons against the older keyword detector are the point: each one
 * is a case a real goal hits and substring matching got wrong.
 */

const action = (signature: string): NormalizedAgentEvent => ({
  id: "e1",
  sessionId: "s1",
  timestamp: "2026-09-03T10:00:00.000Z",
  source: "claude_code",
  type: "file_edit",
  signature,
});

const edit = (path: string): NormalizedAgentEvent => action(`file_edit|tool:Edit|path:${path}`);

const token = createTokenGoalDriftDetector();
const keyword = createKeywordGoalDriftDetector();
const GOAL = { text: "Fix the authentication timeout", keywords: [] as string[] };

describe("tokenize", () => {
  it("splits paths and identifiers into words", () => {
    expect(tokenize("src/auth/tokenRefresh.test.ts")).toEqual([
      "src",
      "auth",
      "token",
      "refresh",
      "test",
    ]);
  });

  it("drops stop words and fragments too short to mean anything", () => {
    expect(tokenize("fix the a to b")).toEqual([]);
  });
});

describe("stem", () => {
  it("folds common suffixes together", () => {
    expect(stem("timeouts")).toBe(stem("timeout"));
    expect(stem("tests")).toBe(stem("test"));
    expect(stem("authentication")).toBe("authentic");
  });

  it("leaves short words alone rather than mangling them", () => {
    expect(stem("auth")).toBe("auth");
    expect(stem("css")).toBe("css");
  });
});

describe("token goal-drift detector", () => {
  it("connects a goal word to the abbreviation a file actually uses", () => {
    // The single most common way a real goal relates to a real path, and the
    // case substring matching had backwards: it could find "auth" inside
    // "authentication" but never the reverse.
    expect(token.measureAdherence([edit("src/auth.ts")], GOAL)).toBe(1);
    expect(keyword.measureAdherence([edit("src/auth.ts")], GOAL)).toBeNull();
  });

  it("sees inside camelCase identifiers", () => {
    expect(token.measureAdherence([edit("src/authTokens.ts")], GOAL)).toBe(1);
    expect(keyword.measureAdherence([edit("src/authTokens.ts")], GOAL)).toBeNull();
  });

  it("matches across a plural", () => {
    expect(token.measureAdherence([edit("src/timeouts.ts")], GOAL)).toBe(1);
  });

  it("still says no to something genuinely unrelated", () => {
    expect(token.measureAdherence([edit("src/billing/invoice.ts")], GOAL)).toBeNull();
  });

  it("measures the fraction of actions that relate to the goal", () => {
    const events = [
      edit("src/auth.ts"),
      edit("src/billing/invoice.ts"),
      edit("src/ui/theme.ts"),
      edit("src/authTokens.ts"),
    ];
    expect(token.measureAdherence(events, GOAL)).toBe(0.5);
  });

  it("reports unknown rather than zero when nothing matches at all", () => {
    const typo = { text: "go witht the ohase 6", keywords: [] as string[] };
    expect(token.measureAdherence([edit("src/auth.ts")], typo)).toBeNull();
  });

  it("reports unknown when the goal has no usable words", () => {
    expect(
      token.measureAdherence([edit("src/auth.ts")], { text: "do it", keywords: [] }),
    ).toBeNull();
  });

  it("reports unknown when there are no actions to measure", () => {
    expect(token.measureAdherence([], GOAL)).toBeNull();
  });

  it("uses explicit keywords as well as the goal sentence", () => {
    const goal = { text: null, keywords: ["billing"] };
    expect(token.measureAdherence([edit("src/billing/invoice.ts")], goal)).toBe(1);
  });
});
