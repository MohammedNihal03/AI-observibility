import { describe, expect, it } from "vitest";

import { PACKAGE_NAME } from "./index.js";

describe("@observatory/metrics", () => {
  it("exposes its package identity", () => {
    expect(PACKAGE_NAME).toBe("@observatory/metrics");
  });
});
