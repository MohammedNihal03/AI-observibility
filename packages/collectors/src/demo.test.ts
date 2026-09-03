import {
  agentEventInputSchema,
  isActionEvent,
  isFailure,
  type AgentEventInput,
} from "@observatory/shared";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEMO_START,
  DEMO_ACTION_COUNT,
  DEMO_SCENARIOS,
  generateDemoSession,
  isDemoScenario,
  type DemoScenario,
} from "./demo.js";

/**
 * Generator-level tests (BUILD.md sections 34, 57).
 *
 * These assert what the generator itself owes its callers: valid events, a
 * deterministic result for a fixed seed, honest labelling, and a structure the
 * behavioural engine can measure. Whether the scenarios actually classify as
 * improving / stable / degrading is asserted end to end in `cli/src/demo.test.ts`,
 * where the analytics engine is available.
 */

const actionsOf = (events: readonly AgentEventInput[]): readonly AgentEventInput[] =>
  events.filter((event) => isActionEvent(event));

const phaseOf = (event: AgentEventInput): string => String(event.metadata?.["phase"] ?? "");

const commandsOf = (events: readonly AgentEventInput[]): readonly string[] =>
  events
    .filter((event) => event.type === "tool_call")
    .map((event) => event.tool?.command ?? "")
    .filter((command) => command !== "");

/** The shape of a session, ignoring which files and commands it happened to use. */
const skeletonOf = (events: readonly AgentEventInput[]): readonly string[] =>
  events.map((event) => `${event.type}:${event.result?.status ?? "-"}`);

describe("demo scenarios", () => {
  it("names exactly the three scenarios BUILD.md section 33 requires", () => {
    expect([...DEMO_SCENARIOS]).toEqual(["improving", "stable", "degrading"]);
  });

  it("recognizes scenario names and rejects anything else", () => {
    expect(isDemoScenario("improving")).toBe(true);
    expect(isDemoScenario("degrading")).toBe(true);
    expect(isDemoScenario("IMPROVING")).toBe(false);
    expect(isDemoScenario("flaky")).toBe(false);
  });
});

describe.each(DEMO_SCENARIOS)("generateDemoSession(%s)", (scenario: DemoScenario) => {
  const demo = generateDemoSession({ scenario });

  it("emits only events the ingestion pipeline accepts", () => {
    for (const event of demo.events) {
      expect(() => agentEventInputSchema.parse(event)).not.toThrow();
    }
  });

  it("labels itself as simulated at every layer", () => {
    expect(demo.simulated).toBe(true);
    expect(demo.sessionId.startsWith("demo_")).toBe(true);
    for (const event of demo.events) {
      expect(event.metadata?.["simulated"]).toBe(true);
      expect(event.metadata?.["scenario"]).toBe(scenario);
    }
  });

  it("opens and closes the session", () => {
    expect(demo.events[0]?.type).toBe("session_started");
    expect(demo.events[demo.events.length - 1]?.type).toBe("session_ended");
  });

  it("produces three equal windows worth of actions", () => {
    const actions = actionsOf(demo.events);
    expect(actions).toHaveLength(DEMO_ACTION_COUNT);

    const perPhase = new Map<string, number>();
    for (const action of actions) {
      perPhase.set(phaseOf(action), (perPhase.get(phaseOf(action)) ?? 0) + 1);
    }
    expect([...perPhase.keys()]).toEqual(["early", "middle", "recent"]);
    expect([...perPhase.values()]).toEqual([
      DEMO_ACTION_COUNT / 3,
      DEMO_ACTION_COUNT / 3,
      DEMO_ACTION_COUNT / 3,
    ]);
  });

  it("advances time strictly, starting where it was told to", () => {
    expect(demo.startedAt).toBe(DEFAULT_DEMO_START);
    expect(demo.events[0]?.timestamp).toBe(DEFAULT_DEMO_START);

    const times = demo.events.map((event) => Date.parse(event.timestamp ?? ""));
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]).toBeGreaterThan(times[index - 1] ?? 0);
    }
    expect(Date.parse(demo.endedAt)).toBe(times[times.length - 1]);
  });

  it("reports a context window, without which context pressure is unmeasurable", () => {
    expect(demo.contextWindow).toBeGreaterThan(0);
    const live = demo.events
      .filter((event) => event.tokens !== undefined)
      .map((event) => (event.tokens?.input ?? 0) + (event.tokens?.cached ?? 0));
    expect(live.length).toBeGreaterThan(0);
    // Context is a level that grows over a session, not a total.
    expect(Math.max(...live)).toBeLessThanOrEqual(demo.contextWindow);
    expect(live[live.length - 1]).toBe(Math.max(...live));
  });

  it("pairs every command with a result carrying the agent's own call id", () => {
    const calls = demo.events.filter((event) => event.type === "tool_call");
    const results = demo.events.filter((event) => event.type === "tool_result");
    expect(results).toHaveLength(calls.length);

    const callIds = calls.map((event) => event.metadata?.["callId"]);
    expect(new Set(callIds).size).toBe(calls.length);
    expect(results.map((event) => event.metadata?.["callId"])).toEqual(callIds);
  });

  it("is byte-for-byte reproducible for a fixed seed (section 57)", () => {
    expect(generateDemoSession({ scenario, seed: "x1" })).toEqual(
      generateDemoSession({ scenario, seed: "x1" }),
    );
  });

  it("lets the seed change the names but never the behaviour", () => {
    const first = generateDemoSession({ scenario, seed: "seed-one" });
    const second = generateDemoSession({ scenario, seed: "seed-two" });

    expect(skeletonOf(second.events)).toEqual(skeletonOf(first.events));
    expect(commandsOf(second.events)).not.toEqual(commandsOf(first.events));
  });

  it("keeps distinct slots distinct, so repetition is never invented", () => {
    // Two different files must never collapse onto one path: that would turn
    // two unrelated edits into a repeated action.
    const demoEvents = generateDemoSession({ scenario, seed: "collision-check" }).events;
    const reads = demoEvents.filter((event) => event.type === "file_read");
    expect(new Set(reads.map((event) => event.files?.path)).size).toBeGreaterThan(1);
  });

  it("accepts an explicit start time and session id", () => {
    const custom = generateDemoSession({
      scenario,
      startedAt: "2026-04-01T09:00:00.000Z",
      sessionId: "demo_custom",
    });
    expect(custom.events[0]?.timestamp).toBe("2026-04-01T09:00:00.000Z");
    expect(custom.events.every((event) => event.sessionId === "demo_custom")).toBe(true);
  });
});

describe("scenario shapes (section 34)", () => {
  const failuresPerPhase = (scenario: DemoScenario): Record<string, number> => {
    const demo = generateDemoSession({ scenario });
    const counts: Record<string, number> = { early: 0, middle: 0, recent: 0 };
    for (const event of demo.events) {
      if (event.type === "tool_result" && isFailure(event)) {
        counts[phaseOf(event)] = (counts[phaseOf(event)] ?? 0) + 1;
      }
    }
    return counts;
  };

  it("improving: failures concentrate early and thin out", () => {
    const counts = failuresPerPhase("improving");
    expect(counts["early"]).toBeGreaterThan(counts["middle"] ?? 0);
    expect(counts["middle"]).toBeGreaterThan(counts["recent"] ?? 0);
    expect(counts["recent"]).toBeGreaterThan(0);
  });

  it("stable: every phase fails the same number of times", () => {
    const counts = failuresPerPhase("stable");
    expect(counts["early"]).toBe(counts["middle"]);
    expect(counts["middle"]).toBe(counts["recent"]);
    expect(counts["early"]).toBeGreaterThan(0);
  });

  it("degrading: failures pile up after a competent start", () => {
    const counts = failuresPerPhase("degrading");
    expect(counts["middle"]).toBeGreaterThan(counts["early"] ?? 0);
    expect(counts["recent"]).toBeGreaterThan(counts["early"] ?? 0);
  });

  it("degrading: one command fails at least three times in a row (section 16)", () => {
    const demo = generateDemoSession({ scenario: "degrading" });
    const runs = new Map<string, number>();
    let worst = 0;
    let pending: string | undefined;

    for (const event of demo.events) {
      if (event.type === "tool_call") {
        pending = event.tool?.command;
        continue;
      }
      if (event.type !== "tool_result" || pending === undefined) continue;
      const run = isFailure(event) ? (runs.get(pending) ?? 0) + 1 : 0;
      runs.set(pending, run);
      if (run > worst) worst = run;
      pending = undefined;
    }

    expect(worst).toBeGreaterThanOrEqual(3);
  });

  it("stable: no command ever fails twice in a row", () => {
    const demo = generateDemoSession({ scenario: "stable" });
    const failed = new Set<string>();
    let pending: string | undefined;
    let repeats = 0;

    for (const event of demo.events) {
      if (event.type === "tool_call") {
        pending = event.tool?.command;
        continue;
      }
      if (event.type !== "tool_result" || pending === undefined) continue;
      if (isFailure(event)) {
        if (failed.has(pending)) repeats += 1;
        failed.add(pending);
      } else {
        failed.delete(pending);
      }
      pending = undefined;
    }

    expect(repeats).toBe(0);
  });

  it("degrading: the later phases wander off the stated goal", () => {
    const demo = generateDemoSession({ scenario: "degrading" });
    const related = (phase: string): number => {
      const actions = actionsOf(demo.events).filter((event) => phaseOf(event) === phase);
      const onGoal = actions.filter((event) => {
        const text = `${event.files?.path ?? ""} ${event.tool?.command ?? ""}`.toLowerCase();
        return demo.goalKeywords.some((keyword) => text.includes(keyword));
      });
      return onGoal.length / actions.length;
    };

    expect(related("early")).toBeGreaterThan(related("middle"));
    expect(related("middle")).toBeGreaterThan(related("recent"));
  });
});
