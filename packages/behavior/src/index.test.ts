import { describe, expect, it } from "vitest";

import { PACKAGE_NAME } from "./index.js";

describe("@observatory/behavior", () => {
  it("exposes its package identity", () => {
    expect(PACKAGE_NAME).toBe("@observatory/behavior");
  });
});
