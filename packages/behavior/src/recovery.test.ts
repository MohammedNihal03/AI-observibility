import { describe, expect, it } from "vitest";

import { blindRepetition, healthyRecovery, session } from "./fixtures.js";
import { pairActionsWithOutcomes } from "./pairing.js";
import { analyzeRecovery } from "./recovery.js";
import { detectRepetition } from "./repetition.js";

const analyze = (events: readonly Parameters<typeof analyzeRecovery>[0][number][]) => {
  const { pairs } = pairActionsWithOutcomes(events);
  return { ...analyzeRecovery(events, pairs), repetition: detectRepetition(pairs) };
};

/**
 * The distinction BUILD.md section 16 is built around. These two sessions
 * contain the same repeated command and the same failures; only the presence of
 * a change in between differs, and the engine must reach opposite conclusions.
 */
describe("section 16: healthy recovery vs blind repetition", () => {
  const healthy = analyze(healthyRecovery());
  const blind = analyze(blindRepetition());

  it("treats fail -> edit -> retry -> pass as a recovered failure", () => {
    expect(healthy.recovery.failures).toBe(1);
    expect(healthy.recovery.recoveries).toBe(1);
    expect(healthy.recovery.unresolvedFailures).toBe(0);
  });

  it("counts that as a successful correction loop", () => {
    expect(healthy.loops.correctionLoops).toBe(1);
    expect(healthy.loops.successfulCorrectionLoops).toBe(1);
    expect(healthy.loops.failedCorrectionLoops).toBe(0);
  });

  it("records no blind retry in the healthy session", () => {
    expect(healthy.loops.blindRetries).toBe(0);
  });

  it("treats three identical failures with no change as blind retries", () => {
    expect(blind.loops.blindRetries).toBe(2);
    expect(blind.loops.correctionLoops).toBe(0);
  });

  it("reports the blind session as one unresolved failure episode", () => {
    expect(blind.recovery.failures).toBe(1);
    expect(blind.recovery.recoveries).toBe(0);
    expect(blind.recovery.unresolvedFailures).toBe(1);
    expect(blind.recovery.failureEvents).toBe(3);
  });

  it("surfaces the three-in-a-row run that section 16 calls out", () => {
    expect(blind.repetition.longestConsecutiveFailureRun).toBe(3);
    expect(blind.repetition.repeatedFailedActions).toBe(2);
  });

  it("does not flag the healthy session as repeated failure", () => {
    expect(healthy.repetition.longestConsecutiveFailureRun).toBe(1);
    expect(healthy.repetition.repeatedFailedActions).toBe(0);
  });
});

describe("failure episodes", () => {
  it("groups consecutive failures of one action into a single episode", () => {
    const events = session()
      .run("npm test")
      .fail()
      .run("npm test")
      .fail()
      .edit("src/a.ts")
      .run("npm test")
      .ok()
      .build();

    const { recovery } = analyze(events);
    expect(recovery.failures).toBe(1);
    expect(recovery.failureEvents).toBe(2);
    expect(recovery.recoveries).toBe(1);
    expect(recovery.episodes).toHaveLength(1);
    expect(recovery.episodes[0]?.attempts).toBe(2);
  });

  it("keeps failures of different actions in separate episodes", () => {
    const events = session().run("npm test").fail().run("npm run lint").fail().build();

    const { recovery } = analyze(events);
    expect(recovery.failures).toBe(2);
    expect(recovery.recoveries).toBe(0);
  });

  it("matches the specification's example: 7 episodes, 6 recovered", () => {
    const builder = session();
    for (let index = 0; index < 7; index += 1) {
      builder.run(`task-${index}`).fail();
      if (index < 6) {
        builder.edit(`src/file-${index}.ts`).run(`task-${index}`).ok();
      }
    }
    const { recovery } = analyze(builder.build());
    expect(recovery.failures).toBe(7);
    expect(recovery.recoveries).toBe(6);
    expect(recovery.recoveries / recovery.failures).toBeCloseTo(0.857, 3);
  });

  it("records an episode as recovered only when the same action succeeds", () => {
    const events = session()
      .run("npm test")
      .fail()
      .edit("src/a.ts")
      .run("npm run build")
      .ok()
      .build();

    const { recovery } = analyze(events);
    expect(recovery.failures).toBe(1);
    expect(recovery.recoveries).toBe(0);
  });

  it("reports where an episode started and where it was recovered", () => {
    const { recovery } = analyze(healthyRecovery());
    const episode = recovery.episodes[0];
    expect(episode?.startIndex).toBeGreaterThan(0);
    expect(episode?.recoveredAtIndex).toBeGreaterThan(episode?.startIndex ?? 0);
    expect(episode?.modifiedBetween).toBe(true);
  });
});

describe("correction loops (section 17)", () => {
  it("counts a failed correction loop when the fix did not work", () => {
    const events = session().run("npm test").fail().edit("src/a.ts").run("npm test").fail().build();

    const { loops } = analyze(events);
    expect(loops.correctionLoops).toBe(1);
    expect(loops.failedCorrectionLoops).toBe(1);
    expect(loops.successfulCorrectionLoops).toBe(0);
    expect(loops.blindRetries).toBe(0);
  });

  it("matches the specification's example: 5 loops, 4 successful", () => {
    const builder = session();
    for (let index = 0; index < 5; index += 1) {
      builder.run(`suite-${index}`).fail().edit(`src/f-${index}.ts`).run(`suite-${index}`);
      if (index < 4) builder.ok();
      else builder.fail();
    }
    const { loops } = analyze(builder.build());
    expect(loops.correctionLoops).toBe(5);
    expect(loops.successfulCorrectionLoops).toBe(4);
    expect(loops.successfulCorrectionLoops / loops.correctionLoops).toBe(0.8);
  });

  it("does not call a retry a correction when nothing was edited", () => {
    const events = session().run("npm test").fail().run("npm test").ok().build();
    const { loops } = analyze(events);
    expect(loops.correctionLoops).toBe(0);
    expect(loops.blindRetries).toBe(1);
  });

  it("treats a pass after an unchanged retry as flaky, not as a correction", () => {
    // The failure is still recovered - the agent got a green result - but no
    // correction happened, so it must not be credited as one.
    const events = session().run("npm test").fail().run("npm test").ok().build();
    const { recovery, loops } = analyze(events);
    expect(recovery.recoveries).toBe(1);
    expect(loops.successfulCorrectionLoops).toBe(0);
  });
});

describe("unknown outcomes", () => {
  it("does not treat an unreported result as a failure", () => {
    const events = session().run("npm test").unknown().build();
    const { recovery } = analyze(events);
    expect(recovery.failures).toBe(0);
    expect(recovery.failureEvents).toBe(0);
  });

  it("does not let an unknown result break a failure run", () => {
    const events = session()
      .run("npm test")
      .fail()
      .run("npm test")
      .unknown()
      .run("npm test")
      .fail()
      .build();
    const { repetition } = analyze(events);
    expect(repetition.longestConsecutiveFailureRun).toBe(2);
  });
});

describe("determinism", () => {
  it("produces identical results for the same events", () => {
    const events = healthyRecovery();
    expect(analyze(events).recovery).toEqual(analyze(events).recovery);
  });

  it("does not mutate its input", () => {
    const events = healthyRecovery();
    const before = structuredClone(events);
    analyze(events);
    expect(events).toEqual(before);
  });
});
