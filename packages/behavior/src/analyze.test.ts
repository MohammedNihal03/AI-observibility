import { DEFAULT_SCORING_CONFIG, type NormalizedAgentEvent } from "@observatory/shared";
import { describe, expect, it } from "vitest";

import { analyzeSession, signalsFor, toMetricsSnapshot } from "./analyze.js";
import { blindRepetition, healthyRecovery, session } from "./fixtures.js";

/**
 * End-to-end behavior analysis, and the three scenarios Phase 6's demo
 * generator has to reproduce (BUILD.md section 34).
 *
 * These sessions are hand-built rather than generated, so the expected state is
 * argued from the events rather than tuned until it passed.
 */

/**
 * Improving: starts badly with blind retries, then the agent begins reading
 * before editing, its corrections start working, and repetition falls away.
 */
function improvingSession(): readonly NormalizedAgentEvent[] {
  const builder = session();
  builder.message().tokens(8_000, 400, 12_000);

  // Early: thrashing on the same command with nothing changed.
  builder.run("npm test").fail();
  builder.run("npm test").fail();
  builder.run("npm test").fail();

  // Middle: starts investigating and correcting. Corrections partly work.
  builder.read("src/auth.ts").edit("src/auth.ts").run("npm test").fail();
  builder.read("src/session.ts").edit("src/session.ts").run("npm test").ok();
  builder.tokens(9_000, 500, 20_000);

  // Recent: clean work, distinct actions, everything passing.
  builder.read("src/token.ts").edit("src/token.ts").run("npm run lint").ok();
  builder.read("src/api.ts").edit("src/api.ts").run("npm run build").ok();
  builder.read("src/db.ts").edit("src/db.ts").run("npm run typecheck").ok();

  return builder.build();
}

/** Stable: consistent competent work with an occasional recovered failure. */
function stableSession(): readonly NormalizedAgentEvent[] {
  const builder = session();
  builder.message().tokens(8_000, 400, 12_000);

  for (const name of ["a", "b", "c"]) {
    builder.read(`src/${name}.ts`).edit(`src/${name}.ts`).run(`npm test -- ${name}`).ok();
    builder.read(`src/${name}2.ts`).edit(`src/${name}2.ts`).run(`npm run lint -- ${name}`).fail();
    builder.edit(`src/${name}2.ts`).run(`npm run lint -- ${name}`).ok();
  }

  return builder.build();
}

/** Degrading: begins well, then collapses into repeated failures. */
function degradingSession(): readonly NormalizedAgentEvent[] {
  const builder = session();
  builder.message().tokens(5_000, 400, 5_000);

  // Early: competent.
  builder.read("src/a.ts").edit("src/a.ts").run("npm test").ok();
  builder.read("src/b.ts").edit("src/b.ts").run("npm run lint").ok();
  builder.read("src/c.ts").edit("src/c.ts").run("npm run build").ok();

  // Middle: corrections start failing.
  builder.edit("src/a.ts").run("npm test").fail();
  builder.edit("src/a.ts").run("npm test").fail();

  // Recent: blind repetition, nothing changing, everything failing.
  builder.run("npm test").fail();
  builder.run("npm test").fail();
  builder.run("npm test").fail();
  builder.run("npm test").fail();
  builder.tokens(180_000, 2_000, 60_000);

  return builder.build();
}

describe("section 34 scenarios", () => {
  it("classifies the improving session as IMPROVING", () => {
    const analysis = analyzeSession(improvingSession());
    expect(analysis.currentState).toBe("improving");
    expect(analysis.learning.score).toBeGreaterThan(50);
  });

  it("classifies the stable session as STABLE", () => {
    const analysis = analyzeSession(stableSession());
    expect(analysis.currentState).toBe("stable");
  });

  /**
   * Regression: window boundaries used to be cut after a window's last action,
   * which stranded that action's outcome in the next window. Failures were then
   * counted without their recoveries and recoveries piled up at window ends, so
   * three identical cycles measured recovery rates of 0.00, 0.00 and 1.00 and a
   * flat session was reported as improving.
   */
  it("measures compositionally identical windows identically", () => {
    const analysis = analyzeSession(stableSession());
    const windows = analysis.windows.windows;
    expect(windows).toHaveLength(3);

    const signature = (index: number): string =>
      JSON.stringify([
        windows[index]?.errorRate,
        windows[index]?.recoveryRate,
        windows[index]?.repetitionRate,
        windows[index]?.toolEfficiency,
      ]);

    expect(signature(1)).toBe(signature(0));
    expect(signature(2)).toBe(signature(0));
    expect(analysis.learning.weightedImprovement).toBe(0);
  });

  it("keeps each action's outcome in the same window as the action", () => {
    // Every window of the stable session contains whole cycles, so each one
    // must see a resolved failure AND its recovery.
    for (const window of analyzeSession(stableSession()).windows.windows) {
      expect(window.recoveryRate).not.toBeNull();
      expect(window.errorRate).not.toBeNull();
    }
  });

  it("classifies the degrading session as DEGRADING", () => {
    const analysis = analyzeSession(degradingSession());
    expect(analysis.currentState).toBe("degrading");
    expect(analysis.learning.score).toBeLessThan(50);
  });

  it("scores degradation higher for the degrading session than the improving one", () => {
    const improving = analyzeSession(improvingSession());
    const degrading = analyzeSession(degradingSession());
    expect(degrading.degradation.score ?? 0).toBeGreaterThan(improving.degradation.score ?? 0);
  });

  it("scores health higher for the improving session than the degrading one", () => {
    const improving = analyzeSession(improvingSession());
    const degrading = analyzeSession(degradingSession());
    expect(improving.health.score ?? 0).toBeGreaterThan(degrading.health.score ?? 0);
  });

  it("detects the blind repetition at the end of the degrading session", () => {
    const analysis = analyzeSession(degradingSession());
    expect(analysis.repetition.longestConsecutiveFailureRun).toBeGreaterThanOrEqual(3);
    expect(analysis.loops.blindRetries).toBeGreaterThan(0);
  });
});

describe("explanations (section 27)", () => {
  it("never returns a score without reasons for a real session", () => {
    const analysis = analyzeSession(degradingSession());
    expect(analysis.health.score).not.toBeNull();
    expect(analysis.reasons.length).toBeGreaterThan(0);
  });

  it("explains an improving session with positive reasons", () => {
    const analysis = analyzeSession(improvingSession());
    expect(analysis.reasons.some((reason) => reason.type === "positive")).toBe(true);
  });

  it("explains a degrading session with negative reasons", () => {
    const analysis = analyzeSession(degradingSession());
    expect(analysis.reasons.some((reason) => reason.type === "negative")).toBe(true);
  });

  it("ties every reason to the metric it came from", () => {
    const analysis = analyzeSession(degradingSession());
    for (const reason of analysis.reasons) {
      expect(reason.metric).toBeDefined();
      expect(reason.message.length).toBeGreaterThan(0);
    }
  });

  it("phrases changes the way section 38 does", () => {
    const analysis = analyzeSession(improvingSession());
    const messages = analysis.reasons.map((reason) => reason.message).join(" | ");
    expect(messages).toMatch(/(increased|decreased|Recovered|correction|Context)/);
  });

  it("caps the number of reasons so the panel stays readable", () => {
    const analysis = analyzeSession(degradingSession());
    expect(analysis.reasons.length).toBeLessThanOrEqual(DEFAULT_SCORING_CONFIG.explain.maxReasons);
  });

  it("says so plainly when there is not enough data", () => {
    const analysis = analyzeSession(session().message().run("npm test").ok().build());
    expect(analysis.currentState).toBe("insufficient_data");
    expect(analysis.reasons.some((reason) => reason.type === "neutral")).toBe(true);
  });
});

describe("signals (sections 15, 23, 51)", () => {
  it("emits a critical signal for three failures in a row", () => {
    const analysis = analyzeSession(blindRepetition());
    const signals = signalsFor("sess_1", analysis);
    const repeated = signals.find((signal) => signal.type === "repeated_failed_action");
    expect(repeated?.severity).toBe("critical");
    expect(repeated?.sessionId).toBe("sess_1");
    expect(repeated?.message).toContain("npm test");
  });

  it("emits a positive signal when a correction loop worked", () => {
    const analysis = analyzeSession(healthyRecovery());
    const signals = signalsFor("sess_1", analysis);
    expect(signals.some((signal) => signal.type === "correction_loop_completed")).toBe(true);
  });

  it("attaches the measurement to each signal", () => {
    const analysis = analyzeSession(blindRepetition());
    const signal = signalsFor("s", analysis).find((s) => s.type === "repeated_failed_action");
    expect(signal?.metadata).toMatchObject({ longestFailureRun: 3 });
  });

  it("emits no signals for a clean short session", () => {
    const analysis = analyzeSession(
      session().read("a.ts").edit("a.ts").run("npm test").ok().build(),
    );
    expect(signalsFor("s", analysis)).toEqual([]);
  });
});

describe("goal drift (section 28)", () => {
  const goalSession = session()
    .read("src/auth/token.ts")
    .edit("src/auth/token.ts")
    .run("npm test -- auth")
    .ok()
    .read("src/billing/invoice.ts")
    .edit("src/billing/invoice.ts")
    .run("npm test -- billing")
    .ok()
    .build();

  it("measures adherence against the stated goal", () => {
    const analysis = analyzeSession(goalSession, {
      goal: { text: "Fix authentication timeout.", keywords: ["auth", "timeout"] },
    });
    expect(analysis.goalAdherence).toBeCloseTo(0.5, 6);
  });

  it("returns null adherence when no goal was given", () => {
    expect(analyzeSession(goalSession).goalAdherence).toBeNull();
  });

  it("returns null when the goal yields no usable keywords at all", () => {
    const analysis = analyzeSession(goalSession, { goal: { text: "do it", keywords: [] } });
    expect(analysis.goalAdherence).toBeNull();
  });

  it("reports 0 when keywords exist but nothing matched", () => {
    // Distinct from null: the detector ran and found no overlap. Section 24
    // bounds the damage of a lazily worded goal by giving goal drift only 10%
    // of the degradation weighting, and the signal is named "possible".
    const analysis = analyzeSession(goalSession, {
      goal: { text: null, keywords: ["kubernetes"] },
    });
    expect(analysis.goalAdherence).toBe(0);
  });

  it("feeds goal adherence into the health score", () => {
    const withGoal = analyzeSession(goalSession, {
      goal: { text: "authentication", keywords: ["auth"] },
    });
    const goalComponent = withGoal.health.components.find((part) => part.name === "goalAdherence");
    expect(goalComponent?.value).not.toBeNull();
  });
});

describe("integration with the metrics engine", () => {
  it("fills in the rates the metrics package leaves null", () => {
    const analysis = analyzeSession(healthyRecovery());
    expect(analysis.metrics.recoveryRate).not.toBeNull();
    expect(analysis.metrics.repetitionRate).not.toBeNull();
    expect(analysis.metrics.correctionLoopRate).not.toBeNull();
  });

  it("reports one set of numbers, not two", () => {
    const analysis = analyzeSession(healthyRecovery());
    expect(analysis.metrics.recoveryRate).toBeCloseTo(
      analysis.recovery.recoveries / analysis.recovery.failures,
      4,
    );
  });

  it("projects onto the persisted snapshot with all three scores", () => {
    const analysis = analyzeSession(improvingSession());
    const snapshot = toMetricsSnapshot("sess_1", analysis);
    expect(snapshot.sessionId).toBe("sess_1");
    expect(snapshot.healthScore).toBe(analysis.health.score);
    expect(snapshot.learningScore).toBe(analysis.learning.score);
    expect(snapshot.degradationScore).toBe(analysis.degradation.score);
  });

  it("keeps context pressure null when no maximum is known", () => {
    const analysis = analyzeSession(improvingSession());
    expect(analysis.metrics.contextPressure).toBeNull();
  });

  it("computes context pressure when a maximum is supplied", () => {
    const analysis = analyzeSession(degradingSession(), {
      metrics: { context: { reportedMaximum: 258_400 } },
    });
    expect(analysis.metrics.contextPressure).not.toBeNull();
  });
});

describe("determinism (section 57)", () => {
  it("produces identical analysis for identical input", () => {
    const events = improvingSession();
    expect(analyzeSession(events)).toEqual(analyzeSession(events));
  });

  it("does not mutate its input", () => {
    const events = degradingSession();
    const before = structuredClone(events);
    analyzeSession(events);
    expect(events).toEqual(before);
  });

  it("handles an empty session without throwing", () => {
    const analysis = analyzeSession([]);
    expect(analysis.health.score).toBeNull();
    expect(analysis.learning.score).toBeNull();
    expect(analysis.currentState).toBe("insufficient_data");
  });
});
