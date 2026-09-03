import type { AgentEvent } from "@observatory/shared";
import { describe, expect, it } from "vitest";

import { computeContextUsage, computeCost, computeTokenUsage, resolvePricing } from "./tokens.js";

let sequence = 0;

function usage(input: number, output: number, cached = 0): AgentEvent {
  sequence += 1;
  return {
    id: `e${sequence}`,
    sessionId: "s",
    timestamp: "2026-09-03T10:00:00.000Z",
    source: "claude_code",
    type: "model_response",
    tokens: { input, output, cached },
  };
}

describe("computeTokenUsage", () => {
  it("sums each token class separately", () => {
    const result = computeTokenUsage([usage(100, 20, 5000), usage(50, 10, 1000)]);
    expect(result).toEqual({ input: 150, output: 30, cached: 6000, total: 6180 });
  });

  it("is all zeros for no events", () => {
    expect(computeTokenUsage([])).toEqual({ input: 0, output: 0, cached: 0, total: 0 });
  });

  it("ignores events with no token data", () => {
    const event: AgentEvent = {
      id: "x",
      sessionId: "s",
      timestamp: "2026-09-03T10:00:00.000Z",
      source: "generic",
      type: "user_message",
    };
    expect(computeTokenUsage([event]).total).toBe(0);
  });
});

describe("computeContextUsage (section 29)", () => {
  const events = [usage(10_000, 500, 30_000), usage(15_000, 800, 60_000)];

  it("reports usage with no utilization when the maximum is unknown", () => {
    const context = computeContextUsage(events);
    expect(context.maximum).toBeNull();
    expect(context.maximumSource).toBe("unknown");
    expect(context.utilization).toBeNull();
    expect(context.used).toBeGreaterThan(0);
  });

  // Live context is input + cached read; output tokens are generated, not
  // occupying the input window. Peak here is turn two: 15_000 + 60_000.
  const PEAK_CONTEXT = 75_000;

  it("labels a maximum the agent reported as reported", () => {
    const context = computeContextUsage(events, { reportedMaximum: 258_400 });
    expect(context.maximumSource).toBe("reported");
    expect(context.used).toBe(PEAK_CONTEXT);
    expect(context.utilization).toBeCloseTo(PEAK_CONTEXT / 258_400, 6);
  });

  it("labels a maximum from local config as configured, not reported", () => {
    const context = computeContextUsage(events, { configuredMaximum: 200_000 });
    expect(context.maximumSource).toBe("configured");
    expect(context.utilization).toBeCloseTo(PEAK_CONTEXT / 200_000, 6);
  });

  it("excludes output tokens from the live context", () => {
    const context = computeContextUsage([usage(1_000, 9_999, 0)]);
    expect(context.used).toBe(1_000);
  });

  it("prefers a reported maximum over a configured one", () => {
    const context = computeContextUsage(events, {
      reportedMaximum: 258_400,
      configuredMaximum: 200_000,
    });
    expect(context.maximum).toBe(258_400);
    expect(context.maximumSource).toBe("reported");
  });

  it("treats a zero or negative maximum as unknown rather than dividing by it", () => {
    expect(computeContextUsage(events, { reportedMaximum: 0 }).maximumSource).toBe("unknown");
    expect(computeContextUsage(events, { configuredMaximum: -1 }).utilization).toBeNull();
  });

  it("treats an explicit null maximum as unknown", () => {
    const context = computeContextUsage(events, { reportedMaximum: null });
    expect(context.utilization).toBeNull();
  });

  it("measures context as a level, not a running total", () => {
    // Two turns of 25k live context must not read as 50k used.
    const context = computeContextUsage([usage(25_000, 100, 0), usage(25_000, 100, 0)]);
    expect(context.used).toBe(25_000);
    expect(context.tokens.input).toBe(50_000);
  });

  it("counts cached reads as part of the live context", () => {
    const context = computeContextUsage([usage(2, 400, 52_000)]);
    expect(context.used).toBe(52_002);
  });

  it("keeps the peak after a mid-session compaction", () => {
    const context = computeContextUsage([usage(100_000, 10, 0), usage(5_000, 10, 0)]);
    expect(context.used).toBe(100_000);
  });

  it("never exceeds 100% utilization", () => {
    const context = computeContextUsage([usage(500_000, 0, 0)], { reportedMaximum: 200_000 });
    expect(context.utilization).toBe(1);
  });
});

describe("computeCost (section 30)", () => {
  const tokens = { input: 1_000_000, output: 500_000, cached: 2_000_000, total: 3_500_000 };

  it("is unavailable with no reported figure and no pricing", () => {
    const cost = computeCost(tokens);
    expect(cost.amountUsd).toBeNull();
    expect(cost.source).toBe("unavailable");
  });

  it("uses a reported figure as-is", () => {
    const cost = computeCost(tokens, { reportedUsd: 0.700926 });
    expect(cost.amountUsd).toBe(0.700926);
    expect(cost.source).toBe("reported");
  });

  it("accepts a reported zero, which is a real answer", () => {
    const cost = computeCost(tokens, { reportedUsd: 0 });
    expect(cost.amountUsd).toBe(0);
    expect(cost.source).toBe("reported");
  });

  it("prefers a reported figure over configured pricing", () => {
    const cost = computeCost(tokens, {
      reportedUsd: 1.23,
      pricing: { inputPerMillionUsd: 10, outputPerMillionUsd: 50 },
    });
    expect(cost.source).toBe("reported");
    expect(cost.amountUsd).toBe(1.23);
  });

  it("estimates from configured pricing and says it is an estimate", () => {
    const cost = computeCost(tokens, {
      pricing: {
        inputPerMillionUsd: 10,
        outputPerMillionUsd: 50,
        cachedInputPerMillionUsd: 1,
      },
    });
    // 1M input at $10 + 0.5M output at $50 + 2M cached at $1
    expect(cost.amountUsd).toBeCloseTo(10 + 25 + 2, 10);
    expect(cost.source).toBe("estimated");
  });

  it("falls back to the input price when no cached price is configured", () => {
    const cost = computeCost(
      { input: 0, output: 0, cached: 1_000_000, total: 1_000_000 },
      { pricing: { inputPerMillionUsd: 10, outputPerMillionUsd: 50 } },
    );
    expect(cost.amountUsd).toBeCloseTo(10, 10);
  });

  it("ignores a non-finite reported figure", () => {
    expect(computeCost(tokens, { reportedUsd: Number.NaN }).source).toBe("unavailable");
  });
});

describe("resolvePricing", () => {
  const registry = {
    "claude-opus-5": { inputPerMillionUsd: 15, outputPerMillionUsd: 75 },
  };

  it("finds an exact match", () => {
    expect(resolvePricing("claude-opus-5", registry)?.inputPerMillionUsd).toBe(15);
  });

  it("refuses to price an unknown model by guessing a similar one", () => {
    expect(resolvePricing("claude-opus-4", registry)).toBeUndefined();
    expect(resolvePricing("claude-opus-5[1m]", registry)).toBeUndefined();
  });

  it("handles a missing model or registry", () => {
    expect(resolvePricing(null, registry)).toBeUndefined();
    expect(resolvePricing(undefined, registry)).toBeUndefined();
    expect(resolvePricing("claude-opus-5", undefined)).toBeUndefined();
  });

  it("ships no pricing of its own", () => {
    expect(resolvePricing("claude-opus-5", {})).toBeUndefined();
  });
});
