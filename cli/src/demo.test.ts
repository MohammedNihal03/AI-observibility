import { DEMO_SCENARIOS, type DemoScenario } from "@observatory/collectors";
import { describe, expect, it } from "vitest";

import { demoSummary, formatDemoReport, runDemo } from "./demo.js";

/**
 * Phase 6's central claim: each scenario produces the state it advertises
 * (BUILD.md section 34), through the real pipeline and for every seed
 * (section 57).
 *
 * The assertions are on STATES and on bands, not on exact scores. The scoring
 * weights are a product decision that will be retuned (section 20); a test
 * pinning `learning === 73` would turn every retune into a test failure without
 * saying anything about whether the demo still demonstrates what it claims.
 */

const SEEDS = ["observatory", "a", "b", "c", "42", "long-seed-value", ""];

describe.each(DEMO_SCENARIOS)("observatory demo --scenario %s", (scenario: DemoScenario) => {
  const run = runDemo({ scenario });

  it("processes every generated event through validation and redaction", () => {
    expect(run.events).toHaveLength(run.demo.events.length);
    expect(run.events.every((event) => event.sessionId === run.demo.sessionId)).toBe(true);
    // A demo carries no credentials, so nothing should ever be redacted out of
    // one. If this fails, the generator started emitting something secret-like.
    expect(run.redactions).toBe(0);
  });

  it("gives every event a stable signature and id", () => {
    expect(run.events.every((event) => event.signature.length > 0)).toBe(true);
    expect(new Set(run.events.map((event) => event.id)).size).toBe(run.events.length);
  });

  it("has enough data for the engine to classify it", () => {
    expect(run.analysis.windows.windows).toHaveLength(3);
    expect(run.analysis.windows.insufficient).toBe(false);
    expect(run.analysis.currentState).not.toBe("insufficient_data");
    expect(run.analysis.health.score).not.toBeNull();
    expect(run.analysis.learning.score).not.toBeNull();
    expect(run.analysis.degradation.score).not.toBeNull();
  });

  it("explains itself - a score without reasons is a bug (section 27)", () => {
    expect(run.analysis.reasons.length).toBeGreaterThan(0);
    for (const reason of run.analysis.reasons) {
      expect(reason.message.length).toBeGreaterThan(0);
    }
  });

  it("measures context pressure, because the demo reports a context window", () => {
    expect(run.analysis.metrics.contextPressure).not.toBeNull();
    expect(run.analysis.metrics.context.maximumSource).toBe("reported");
  });

  it("reaches the same verdict for every seed (section 57)", () => {
    const states = SEEDS.map((seed) => runDemo({ scenario, seed }).analysis.currentState);
    expect(new Set(states).size).toBe(1);
    expect(states[0]).toBe(run.analysis.currentState);
  });

  it("is reproducible: one seed, one analysis", () => {
    const first = runDemo({ scenario, seed: "repeat" });
    const second = runDemo({ scenario, seed: "repeat" });
    expect(demoSummary(second)).toEqual(demoSummary(first));
  });
});

describe("scenario verdicts (section 34)", () => {
  const scores = (scenario: DemoScenario) => {
    const { analysis } = runDemo({ scenario });
    return {
      state: analysis.currentState,
      health: analysis.health.score ?? -1,
      healthState: analysis.health.state,
      learning: analysis.learning.score ?? -1,
      degradation: analysis.degradation.score ?? -1,
      recovery: analysis.metrics.recoveryRate,
      longestFailureRun: analysis.repetition.longestConsecutiveFailureRun,
      contextPressure: analysis.metrics.contextPressure ?? -1,
    };
  };

  it("improving: recovers from everything and trends upward", () => {
    const result = scores("improving");
    expect(result.state).toBe("improving");
    expect(result.learning).toBeGreaterThan(50);
    expect(result.recovery).toBe(1);
    expect(result.degradation).toBeLessThan(40);
    // The healthy example must not simultaneously raise the engine's most
    // serious signal about itself (section 16: three failures in a row).
    expect(result.longestFailureRun).toBeLessThan(3);
  });

  it("stable: no trend in either direction", () => {
    const result = scores("stable");
    expect(result.state).toBe("stable");
    expect(result.learning).toBe(50);
    expect(result.healthState).toBe("healthy");
    expect(result.degradation).toBeLessThan(10);
  });

  it("degrading: every degradation signal the engine has", () => {
    const result = scores("degrading");
    expect(result.state).toBe("degrading");
    expect(result.learning).toBeLessThan(50);
    expect(result.healthState).toBe("degrading");
    expect(result.degradation).toBeGreaterThan(60);
    expect(result.longestFailureRun).toBeGreaterThanOrEqual(3);
    expect(result.contextPressure).toBeGreaterThan(0.9);
  });

  it("orders the three scenarios the way a developer would expect", () => {
    const improving = scores("improving");
    const stable = scores("stable");
    const degrading = scores("degrading");

    expect(improving.learning).toBeGreaterThan(stable.learning);
    expect(stable.learning).toBeGreaterThan(degrading.learning);
    expect(degrading.degradation).toBeGreaterThan(improving.degradation);
    expect(improving.degradation).toBeGreaterThan(stable.degradation);
    expect(degrading.health).toBeLessThan(improving.health);
  });

  it("moves the trend across the windows, not just the totals", () => {
    const improving = runDemo({ scenario: "improving" }).analysis.trends;
    const degrading = runDemo({ scenario: "degrading" }).analysis.trends;

    expect(improving.errorRate.delta ?? 0).toBeLessThan(0);
    expect(improving.recoveryRate.delta ?? 0).toBeGreaterThan(0);
    expect(improving.repetitionRate.delta ?? 0).toBeLessThan(0);

    expect(degrading.errorRate.delta ?? 0).toBeGreaterThan(0);
    expect(degrading.recoveryRate.delta ?? 0).toBeLessThan(0);
    expect(degrading.goalAdherence.delta ?? 0).toBeLessThan(0);
  });
});

describe("demo output", () => {
  const run = runDemo({ scenario: "improving" });

  it("says plainly that the data is simulated", () => {
    const report = formatDemoReport(run);
    expect(report).toContain("SIMULATED DATA");
    expect(report).toContain(run.demo.sessionId);
  });

  it("never claims to measure model learning (section 2)", () => {
    const report = formatDemoReport(run).toLowerCase();
    expect(report).toContain("behavioral learning");
    expect(report).toContain("it is not model learning");
    expect(report).not.toMatch(/measures? (the )?(model|neural)/);
  });

  it("shows the scores with their explanations", () => {
    const report = formatDemoReport(run);
    expect(report).toContain("AGENT HEALTH");
    expect(report).toContain("WHY THE AGENT IS IMPROVING");
    for (const reason of run.analysis.reasons) {
      expect(report).toContain(reason.message);
    }
  });

  it("summarizes to JSON that carries the simulated flag", () => {
    const summary = demoSummary(run);
    expect(summary["simulated"]).toBe(true);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });

  it("attributes every signal to the session it came from", () => {
    const summary = demoSummary(run) as { signals: { sessionId: string }[] };
    for (const signal of summary.signals) {
      expect(signal.sessionId).toBe(run.demo.sessionId);
    }
  });
});
