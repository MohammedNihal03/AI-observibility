import { describe, expect, it } from "vitest";

import { emptyCounters, type CounterDetail } from "./counters.js";
import {
  behavioralRates,
  correctionLoopRate,
  errorRate,
  recoveryRate,
  repetitionRate,
  successRate,
  toolEfficiency,
} from "./rates.js";

const counters = (overrides: Partial<CounterDetail>): CounterDetail => ({
  ...emptyCounters(),
  ...overrides,
});

describe("successRate (section 12)", () => {
  it("matches the specification's worked example: 80 of 100", () => {
    const value = successRate(
      counters({ successfulOutcomes: 80, failedOutcomes: 20, resolvedOutcomes: 100 }),
    );
    expect(value).toBe(0.8);
  });

  it("is null when nothing has finished yet", () => {
    expect(successRate(emptyCounters())).toBeNull();
  });

  it("is null rather than zero when only unresolved outcomes exist", () => {
    expect(successRate(counters({ unresolvedOutcomes: 5 }))).toBeNull();
  });

  it("excludes unresolved outcomes from the denominator", () => {
    const value = successRate(
      counters({
        successfulOutcomes: 8,
        failedOutcomes: 2,
        resolvedOutcomes: 10,
        unresolvedOutcomes: 90,
      }),
    );
    expect(value).toBe(0.8);
  });
});

describe("errorRate", () => {
  it("complements the success rate", () => {
    const detail = counters({
      successfulOutcomes: 80,
      failedOutcomes: 20,
      resolvedOutcomes: 100,
    });
    const success = successRate(detail);
    const error = errorRate(detail);
    expect(error).toBe(0.2);
    expect((success ?? 0) + (error ?? 0)).toBeCloseTo(1, 10);
  });

  it("is null when nothing has finished", () => {
    expect(errorRate(emptyCounters())).toBeNull();
  });

  it("is 1 when everything failed", () => {
    expect(errorRate(counters({ failedOutcomes: 3, resolvedOutcomes: 3 }))).toBe(1);
  });
});

describe("toolEfficiency (section 13)", () => {
  it("divides successful tool calls by the results observed", () => {
    expect(
      toolEfficiency(counters({ successfulToolCalls: 9, failedToolCalls: 1, toolResults: 10 })),
    ).toBe(0.9);
  });

  it("is null when no tool has been called", () => {
    expect(toolEfficiency(emptyCounters())).toBeNull();
  });

  it("never exceeds 1 when adapters emit semantic types for file tools", () => {
    // Regression: the numerator came from tool_result events while the
    // denominator counted only `tool_call`, so file operations landed on one
    // side only and the ratio went over 1 before being clamped.
    const detail = counters({
      successfulToolCalls: 75,
      failedToolCalls: 8,
      toolResults: 83,
      totalToolCalls: 83,
    });
    const value = toolEfficiency(detail);
    expect(value).toBeCloseTo(75 / 83, 6);
    expect(value).toBeLessThan(1);
  });

  it("does not blame the agent for results that never arrived", () => {
    const detail = counters({
      successfulToolCalls: 5,
      failedToolCalls: 0,
      toolResults: 5,
      totalToolCalls: 10,
      unresolvedToolCalls: 5,
    });
    expect(toolEfficiency(detail)).toBe(1);
    expect(detail.unresolvedToolCalls).toBe(5);
  });

  it("is 0 when every observed tool call failed", () => {
    expect(
      toolEfficiency(counters({ successfulToolCalls: 0, failedToolCalls: 4, toolResults: 4 })),
    ).toBe(0);
  });
});

describe("recoveryRate (section 18)", () => {
  it("matches the specification's worked example: 6 of 7 is 85.7%", () => {
    const value = recoveryRate({ failures: 7, recoveries: 6 });
    expect(value).not.toBeNull();
    expect(((value ?? 0) * 100).toFixed(1)).toBe("85.7");
  });

  it("is null when there were no failures to recover from", () => {
    expect(recoveryRate({ failures: 0, recoveries: 0 })).toBeNull();
  });

  it("does not exceed 1 if recoveries are over-counted", () => {
    expect(recoveryRate({ failures: 2, recoveries: 5 })).toBe(1);
  });

  it("is 0 when nothing was recovered", () => {
    expect(recoveryRate({ failures: 3, recoveries: 0 })).toBe(0);
  });
});

describe("repetitionRate (section 15)", () => {
  it("is zero when every action is distinct", () => {
    expect(repetitionRate(0, 10)).toBe(0);
  });

  it("counts only repeats, not first occurrences", () => {
    // npm test run three times: two of them are repeats.
    expect(repetitionRate(2, 3)).toBeCloseTo(0.6667, 4);
  });

  it("is null when there were no actions", () => {
    expect(repetitionRate(0, 0)).toBeNull();
  });
});

describe("correctionLoopRate (section 17)", () => {
  it("matches the specification's worked example: 4 of 5 is 80%", () => {
    expect(correctionLoopRate({ correctionLoops: 5, successfulCorrectionLoops: 4 })).toBe(0.8);
  });

  it("is null when no correction loop occurred", () => {
    expect(correctionLoopRate({ correctionLoops: 0, successfulCorrectionLoops: 0 })).toBeNull();
  });
});

describe("behavioralRates", () => {
  const counts = {
    failures: 7,
    recoveries: 6,
    repeatedActions: 2,
    repeatedFailedActions: 1,
    correctionLoops: 5,
    successfulCorrectionLoops: 4,
  };

  it("produces all three behaviour-derived rates", () => {
    const rates = behavioralRates(counts, 20);
    expect(rates.recoveryRate).toBeCloseTo(0.8571, 4);
    expect(rates.repetitionRate).toBeCloseTo(0.1, 4);
    expect(rates.correctionLoopRate).toBe(0.8);
  });

  it("returns nulls rather than zeros for an untouched session", () => {
    const rates = behavioralRates(
      {
        failures: 0,
        recoveries: 0,
        repeatedActions: 0,
        repeatedFailedActions: 0,
        correctionLoops: 0,
        successfulCorrectionLoops: 0,
      },
      0,
    );
    expect(rates.recoveryRate).toBeNull();
    expect(rates.repetitionRate).toBeNull();
    expect(rates.correctionLoopRate).toBeNull();
  });
});
