import { describe, expect, it } from "vitest";

import { CONTRACT_VERSION, OBSERVATORY_VERSION, PACKAGE_NAME } from "./index.js";

describe("@observatory/shared", () => {
  it("exposes its package identity", () => {
    expect(PACKAGE_NAME).toBe("@observatory/shared");
  });

  it("exposes a contract version", () => {
    expect(CONTRACT_VERSION).toBe(1);
  });

  it("exposes the product version", () => {
    expect(OBSERVATORY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
