import { describe, expect, it } from "vitest";

import { rate, ratio, round, toPercent } from "./ratio.js";

describe("ratio", () => {
  it("divides normally", () => {
    expect(ratio(80, 100)).toBe(0.8);
  });

  it("returns null for a zero denominator instead of 0 or NaN", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(5, 0)).toBeNull();
  });

  it("returns null for a negative denominator", () => {
    expect(ratio(1, -1)).toBeNull();
  });

  it("returns null for non-finite input", () => {
    expect(ratio(Number.NaN, 1)).toBeNull();
    expect(ratio(1, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("rate", () => {
  it("clamps above one", () => {
    expect(rate(150, 100)).toBe(1);
  });

  it("clamps below zero", () => {
    expect(rate(-5, 100)).toBe(0);
  });

  it("preserves null", () => {
    expect(rate(1, 0)).toBeNull();
  });
});

describe("round", () => {
  it("rounds to four decimals by default", () => {
    expect(round(0.857142857)).toBe(0.8571);
  });

  it("never turns null into a number", () => {
    expect(round(null)).toBeNull();
  });

  it("keeps an exact zero", () => {
    expect(round(0)).toBe(0);
  });
});

describe("toPercent", () => {
  it("converts a rate for display", () => {
    expect(toPercent(0.857142857)).toBe(85.7);
  });

  it("keeps null as null, so the UI can say 'unavailable'", () => {
    expect(toPercent(null)).toBeNull();
  });
});
