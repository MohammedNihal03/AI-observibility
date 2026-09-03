import type { AgentEvent, BehavioralCounts } from "@observatory/shared";
import { describe, expect, it } from "vitest";

import { computeSessionMetrics, countActions, toSnapshot } from "./session.js";

let sequence = 0;

function evt(partial: Partial<AgentEvent> & Pick<AgentEvent, "type">): AgentEvent {
  sequence += 1;
  return {
    id: `e${sequence}`,
    sessionId: "s",
    timestamp: `2026-09-03T10:00:${String(sequence % 60).padStart(2, "0")}.000Z`,
    source: "claude_code",
    ...partial,
  };
}

/** A short realistic session: edit, test, fail, edit, test, pass. */
const CORRECTION_SESSION: AgentEvent[] = [
  evt({ type: "user_message" }),
  evt({ type: "model_response", tokens: { input: 8_000, output: 400, cached: 20_000 } }),
  evt({ type: "file_read", files: { path: "src/auth.ts" } }),
  evt({ type: "file_edit", files: { path: "src/auth.ts" } }),
  evt({ type: "tool_call", tool: { name: "Bash", command: "npm test" } }),
  evt({ type: "tool_result", result: { status: "error", exitCode: 1 } }),
  evt({ type: "file_edit", files: { path: "src/auth.ts" } }),
  evt({ type: "tool_call", tool: { name: "Bash", command: "npm test" } }),
  evt({ type: "tool_result", result: { status: "success", exitCode: 0 } }),
];

const BEHAVIOR: BehavioralCounts = {
  failures: 1,
  recoveries: 1,
  repeatedActions: 1,
  repeatedFailedActions: 0,
  correctionLoops: 1,
  successfulCorrectionLoops: 1,
};

describe("countActions", () => {
  it("counts only action events", () => {
    expect(countActions(CORRECTION_SESSION)).toBe(2);
  });

  it("is zero for a session with no actions", () => {
    expect(countActions([evt({ type: "user_message" })])).toBe(0);
  });
});

describe("computeSessionMetrics - empty session", () => {
  const metrics = computeSessionMetrics([]);

  it("reports zero counters", () => {
    expect(metrics.counters.totalEvents).toBe(0);
  });

  it("reports every rate as null, never zero", () => {
    expect(metrics.successRate).toBeNull();
    expect(metrics.errorRate).toBeNull();
    expect(metrics.toolEfficiency).toBeNull();
    expect(metrics.recoveryRate).toBeNull();
    expect(metrics.repetitionRate).toBeNull();
    expect(metrics.correctionLoopRate).toBeNull();
    expect(metrics.contextPressure).toBeNull();
  });

  it("reports cost as unavailable rather than zero", () => {
    expect(metrics.cost).toEqual({ amountUsd: null, source: "unavailable" });
  });

  it("reports duration as null", () => {
    expect(metrics.durationMs).toBeNull();
  });
});

describe("computeSessionMetrics - realistic session", () => {
  const metrics = computeSessionMetrics(CORRECTION_SESSION);

  it("counts the session correctly", () => {
    expect(metrics.counters.totalEvents).toBe(9);
    // One read, two edits and two bash calls: five tool invocations.
    expect(metrics.counters.totalToolCalls).toBe(5);
    expect(metrics.counters.successfulToolCalls).toBe(1);
    expect(metrics.counters.failedToolCalls).toBe(1);
    expect(metrics.counters.commandsExecuted).toBe(2);
    expect(metrics.counters.filesRead).toBe(1);
    expect(metrics.counters.filesModified).toBe(1);
    expect(metrics.counters.errors).toBe(1);
  });

  it("computes success and error rates over resolved outcomes", () => {
    expect(metrics.successRate).toBe(0.5);
    expect(metrics.errorRate).toBe(0.5);
  });

  it("computes tool efficiency", () => {
    expect(metrics.toolEfficiency).toBe(0.5);
  });

  it("leaves behaviour-derived rates null when the behavior engine has not run", () => {
    expect(metrics.recoveryRate).toBeNull();
    expect(metrics.repetitionRate).toBeNull();
    expect(metrics.correctionLoopRate).toBeNull();
  });

  it("leaves goal adherence null until goal-drift detection exists", () => {
    expect(metrics.goalAdherence).toBeNull();
  });

  it("measures duration from the event timestamps", () => {
    expect(metrics.durationMs).toBe(8_000);
  });

  it("sums tokens", () => {
    expect(metrics.tokens).toEqual({ input: 8_000, output: 400, cached: 20_000, total: 28_400 });
  });
});

describe("computeSessionMetrics - with behavioral counts", () => {
  const metrics = computeSessionMetrics(CORRECTION_SESSION, { behavior: BEHAVIOR });

  it("turns the counts into rates", () => {
    expect(metrics.recoveryRate).toBe(1);
    expect(metrics.correctionLoopRate).toBe(1);
    expect(metrics.repetitionRate).toBe(0.5);
  });

  it("shows a recovered failure as a healthy session, not a broken one", () => {
    // One failure, fully recovered: error rate is real but recovery is perfect.
    expect(metrics.errorRate).toBe(0.5);
    expect(metrics.recoveryRate).toBe(1);
  });
});

describe("computeSessionMetrics - a degrading session looks different", () => {
  const failing: AgentEvent[] = [
    evt({ type: "tool_call", tool: { name: "Bash", command: "npm test" } }),
    evt({ type: "tool_result", result: { status: "error", exitCode: 1 } }),
    evt({ type: "tool_call", tool: { name: "Bash", command: "npm test" } }),
    evt({ type: "tool_result", result: { status: "error", exitCode: 1 } }),
    evt({ type: "tool_call", tool: { name: "Bash", command: "npm test" } }),
    evt({ type: "tool_result", result: { status: "error", exitCode: 1 } }),
  ];

  const metrics = computeSessionMetrics(failing, {
    behavior: {
      failures: 3,
      recoveries: 0,
      repeatedActions: 2,
      repeatedFailedActions: 2,
      correctionLoops: 0,
      successfulCorrectionLoops: 0,
    },
  });

  it("reports total failure honestly", () => {
    expect(metrics.successRate).toBe(0);
    expect(metrics.errorRate).toBe(1);
    expect(metrics.toolEfficiency).toBe(0);
    expect(metrics.recoveryRate).toBe(0);
  });

  it("reports high repetition", () => {
    expect(metrics.repetitionRate).toBeCloseTo(0.6667, 4);
  });

  it("has no correction-loop rate, because no loop was attempted", () => {
    expect(metrics.correctionLoopRate).toBeNull();
  });
});

describe("computeSessionMetrics - context and cost options", () => {
  it("passes a reported maximum through to utilization", () => {
    const metrics = computeSessionMetrics(CORRECTION_SESSION, {
      context: { reportedMaximum: 100_000 },
    });
    expect(metrics.context.maximumSource).toBe("reported");
    expect(metrics.contextPressure).toBeCloseTo(0.28, 4);
  });

  it("mirrors context utilization into contextPressure", () => {
    const metrics = computeSessionMetrics(CORRECTION_SESSION, {
      context: { configuredMaximum: 200_000 },
    });
    expect(metrics.contextPressure).toBe(metrics.context.utilization);
  });

  it("uses a reported cost", () => {
    const metrics = computeSessionMetrics(CORRECTION_SESSION, { cost: { reportedUsd: 0.42 } });
    expect(metrics.cost).toEqual({ amountUsd: 0.42, source: "reported" });
  });
});

describe("determinism and purity (sections 50, 57)", () => {
  it("returns identical results for identical input", () => {
    expect(computeSessionMetrics(CORRECTION_SESSION, { behavior: BEHAVIOR })).toEqual(
      computeSessionMetrics(CORRECTION_SESSION, { behavior: BEHAVIOR }),
    );
  });

  it("does not mutate its input", () => {
    const before = structuredClone(CORRECTION_SESSION);
    computeSessionMetrics(CORRECTION_SESSION, { behavior: BEHAVIOR });
    expect(CORRECTION_SESSION).toEqual(before);
  });

  it("does not depend on event order for order-independent metrics", () => {
    const reversed = [...CORRECTION_SESSION].reverse();
    const forward = computeSessionMetrics(CORRECTION_SESSION);
    const backward = computeSessionMetrics(reversed);
    expect(backward.counters).toEqual(forward.counters);
    expect(backward.durationMs).toBe(forward.durationMs);
  });
});

describe("toSnapshot", () => {
  const metrics = computeSessionMetrics(CORRECTION_SESSION, { behavior: BEHAVIOR });
  const snapshot = toSnapshot("sess_1", metrics);

  it("carries the measured rates", () => {
    expect(snapshot.sessionId).toBe("sess_1");
    expect(snapshot.successRate).toBe(0.5);
    expect(snapshot.toolEfficiency).toBe(0.5);
    expect(snapshot.recoveryRate).toBe(1);
  });

  it("leaves the scores null, because this package does not score", () => {
    expect(snapshot.healthScore).toBeNull();
    expect(snapshot.learningScore).toBeNull();
    expect(snapshot.degradationScore).toBeNull();
  });
});
