import { describe, expect, it } from "vitest";

import { session } from "./fixtures.js";
import { pairActionsWithOutcomes } from "./pairing.js";
import { detectRepetition, isDiscriminating } from "./repetition.js";

const detect = (events: readonly Parameters<typeof pairActionsWithOutcomes>[0][number][]) =>
  detectRepetition(pairActionsWithOutcomes(events).pairs);

describe("repetition detection (section 15)", () => {
  it("counts repeats, not occurrences", () => {
    // npm test three times is two repeats: the first time is not a repeat.
    const events = session().run("npm test").ok().run("npm test").ok().run("npm test").ok().build();
    const result = detect(events);
    expect(result.totalActions).toBe(3);
    expect(result.repeatedActions).toBe(2);
  });

  it("reports zero repetition when every action is distinct", () => {
    const events = session().run("npm test").ok().run("npm run lint").ok().build();
    expect(detect(events).repeatedActions).toBe(0);
  });

  it("normalizes cosmetic differences into the same signature", () => {
    const events = session().run("npm test").ok().run("npm test").ok().build();
    expect(detect(events).distinctSignatures).toBe(1);
  });

  it("treats edits to the same file as repetition", () => {
    const events = session().edit("src/a.ts").edit("src/a.ts").edit("src/a.ts").build();
    expect(detect(events).repeatedActions).toBe(2);
  });

  it("treats edits to different files as distinct", () => {
    const events = session().edit("src/a.ts").edit("src/b.ts").build();
    expect(detect(events).repeatedActions).toBe(0);
  });

  it("ranks the worst offender first", () => {
    const events = session()
      .run("npm run lint")
      .ok()
      .run("npm run lint")
      .ok()
      .run("npm test")
      .fail()
      .run("npm test")
      .fail()
      .run("npm test")
      .fail()
      .build();
    const worst = detect(events).repeatedSignatures[0];
    expect(worst?.signature).toContain("npm test");
    expect(worst?.longestFailureRun).toBe(3);
  });
});

/**
 * Regression: a tool whose behavior is driven by neither a command nor a path
 * produced the signature `tool_call|tool:Grep` for every call. Fourteen
 * different searches in a real session then read as one action repeated
 * fourteen times, giving a 60% repetition rate and a fabricated "repetition
 * increased 414%" finding. Repetition is 20% of both the health and learning
 * scores, so the distortion was material.
 */
describe("actions with no discriminator", () => {
  const grep = (index: number) => ({
    id: `g${index}`,
    sessionId: "s",
    timestamp: `2026-09-03T10:00:0${index}.000Z`,
    source: "claude_code" as const,
    type: "tool_call" as const,
    signature: "tool_call|tool:Grep",
    tool: { name: "Grep" },
  });

  it("recognizes which signatures identify their subject", () => {
    expect(isDiscriminating("tool_call|tool:Bash|cmd:npm test")).toBe(true);
    expect(isDiscriminating("file_edit|tool:Edit|path:src/a.ts")).toBe(true);
    expect(isDiscriminating("tool_call|tool:Grep|target:TODO")).toBe(true);
    expect(isDiscriminating("tool_call|tool:Grep")).toBe(false);
    expect(isDiscriminating("user_message")).toBe(false);
  });

  it("excludes indistinguishable actions rather than calling them repetition", () => {
    const events = [grep(1), grep(2), grep(3)];
    const result = detect(events);
    expect(result.repeatedActions).toBe(0);
    expect(result.unmeasurableActions).toBe(3);
    expect(result.totalActions).toBe(0);
  });

  it("keeps the repetition rate null rather than inventing one", () => {
    const result = detect([grep(1), grep(2), grep(3)]);
    // totalActions 0 means the rate divides by zero and stays null.
    expect(result.totalActions).toBe(0);
  });

  it("measures repetition once a target distinguishes the calls", () => {
    const withTargets = [1, 2, 3].map((index) => ({
      ...grep(index),
      signature: `tool_call|tool:Grep|target:pattern-${index === 3 ? 1 : index}`,
      tool: { name: "Grep", target: `pattern-${index === 3 ? 1 : index}` },
    }));
    const result = detect(withTargets);
    expect(result.totalActions).toBe(3);
    expect(result.unmeasurableActions).toBe(0);
    // pattern-1 appears twice, pattern-2 once.
    expect(result.repeatedActions).toBe(1);
  });

  it("counts measurable and unmeasurable actions separately", () => {
    const events = [grep(1), grep(2), ...session().run("npm test").ok().build()];
    const result = detect(events);
    expect(result.unmeasurableActions).toBe(2);
    expect(result.totalActions).toBe(1);
  });
});
