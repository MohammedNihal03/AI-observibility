import { describe, expect, it } from "vitest";

import { session } from "./fixtures.js";
import { pairActionsWithOutcomes } from "./pairing.js";
import { describeStrategy, detectStrategies, generalize } from "./strategy.js";

/**
 * Repeated-strategy detection (BUILD.md section 65, V2).
 *
 * The case that matters is the one exact repetition detection cannot see: the
 * same approach applied to different targets.
 */

const analyze = (events: ReturnType<typeof session>) =>
  detectStrategies(pairActionsWithOutcomes(events.build()).pairs);

describe("generalize", () => {
  it("drops the filename and keeps the module", () => {
    expect(generalize("file_edit|tool:Edit|path:src/auth/token.ts")).toBe("edit:src/auth");
    expect(generalize("file_read|tool:Read|path:src/auth/user.ts")).toBe("read:src/auth");
  });

  it("drops command arguments and keeps the program", () => {
    expect(generalize("tool_call|tool:Bash|cmd:npm test -- auth")).toBe("run:npm test");
    expect(generalize("tool_call|tool:Bash|cmd:npm test -- billing")).toBe("run:npm test");
    expect(generalize("tool_call|tool:Bash|cmd:git status --short")).toBe("run:git status");
  });

  it("separates genuinely different programs", () => {
    expect(generalize("tool_call|tool:Bash|cmd:npm test")).not.toBe(
      generalize("tool_call|tool:Bash|cmd:npm run build"),
    );
  });

  it("excludes an action that identifies nothing", () => {
    // Same reasoning as repetition: unknowable is not the same as identical.
    expect(generalize("tool_call|tool:AskUserQuestion")).toBeNull();
  });
});

describe("detectStrategies", () => {
  it("catches the same approach applied to three different files", () => {
    // Every signature here is distinct, so exact repetition detection sees
    // nothing at all. This is the whole reason the module exists.
    const result = analyze(
      session()
        .edit("src/auth/token.ts")
        .run("npm test -- token")
        .fail()
        .edit("src/auth/user.ts")
        .run("npm test -- user")
        .fail()
        .edit("src/auth/role.ts")
        .run("npm test -- role")
        .fail(),
    );

    expect(result.repeated.length).toBeGreaterThan(0);
    const worst = result.repeated[0];
    expect(worst?.steps).toEqual(["edit:src/auth", "run:npm test"]);
    expect(worst?.occurrences).toBe(3);
    expect(worst?.failed).toBe(3);
    expect(worst?.succeeded).toBe(0);
  });

  it("flags a strategy that never once worked", () => {
    const result = analyze(
      session()
        .edit("src/a/one.ts")
        .run("npm test")
        .fail()
        .edit("src/a/two.ts")
        .run("npm test")
        .fail(),
    );

    expect(result.unproductive).toHaveLength(1);
    expect(result.unproductive[0]?.failed).toBe(2);
  });

  it("does not call a strategy unproductive once it has worked", () => {
    const result = analyze(
      session()
        .edit("src/a/one.ts")
        .run("npm test")
        .fail()
        .edit("src/a/two.ts")
        .run("npm test")
        .ok(),
    );

    expect(result.repeated.length).toBeGreaterThan(0);
    expect(result.unproductive).toHaveLength(0);
  });

  it("prefers the longer strategy over the fragments inside it", () => {
    const result = analyze(
      session()
        .read("src/a/one.ts")
        .edit("src/a/one.ts")
        .run("npm test")
        .fail()
        .read("src/a/two.ts")
        .edit("src/a/two.ts")
        .run("npm test")
        .fail(),
    );

    expect(result.repeated[0]?.length).toBe(3);
    expect(result.repeated[0]?.steps).toEqual(["read:src/a", "edit:src/a", "run:npm test"]);
    // The two-step fragments inside it are not reported a second time.
    expect(result.repeated).toHaveLength(1);
  });

  it("counts occurrences without overlapping them", () => {
    // A B A B A B is three ABs, not five overlapping ones.
    const result = analyze(
      session()
        .edit("src/a/x.ts")
        .run("npm test")
        .edit("src/a/y.ts")
        .run("npm test")
        .edit("src/a/z.ts")
        .run("npm test"),
    );

    expect(result.repeated[0]?.occurrences).toBe(3);
  });

  it("reports how much of the session was spent repeating itself", () => {
    const result = analyze(
      session()
        .edit("src/a/one.ts")
        .run("npm test")
        .fail()
        .edit("src/a/two.ts")
        .run("npm test")
        .fail(),
    );

    expect(result.coverage).toBe(1);
    expect(result.measuredActions).toBe(4);
  });

  it("finds nothing in a session that never repeats an approach", () => {
    const result = analyze(
      session()
        .read("docs/readme.md")
        .edit("src/api/routes.ts")
        .run("npm run build")
        .ok()
        .run("git status"),
    );

    expect(result.repeated).toEqual([]);
    expect(result.unproductive).toEqual([]);
    expect(result.longestStrategy).toBe(0);
  });

  it("says nothing about a session too short to have a strategy", () => {
    expect(analyze(session().run("npm test")).repeated).toEqual([]);
  });

  it("renders a strategy readably", () => {
    const result = analyze(
      session()
        .edit("src/a/one.ts")
        .run("npm test")
        .fail()
        .edit("src/a/two.ts")
        .run("npm test")
        .fail(),
    );

    // The verb survives: "edit src/a" is a step, "src/a" is a noun.
    expect(describeStrategy(result.repeated[0]!)).toBe("edit src/a → npm test");
  });
});
