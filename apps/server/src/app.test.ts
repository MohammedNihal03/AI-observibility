import { afterEach, describe, expect, it } from "vitest";

import { createApp, type HealthResponse } from "./app.js";
import { loadConfig } from "./config.js";

let app: ReturnType<typeof createApp> | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("server", () => {
  it("answers GET /api/health", async () => {
    app = createApp();
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json<HealthResponse>();
    expect(body.status).toBe("ok");
    expect(body.contractVersion).toBe(1);
    expect(Number.isFinite(Date.parse(body.time))).toBe(true);
  });

  it("returns 404 for unknown routes", async () => {
    app = createApp();
    const response = await app.inject({ method: "GET", url: "/api/nope" });
    expect(response.statusCode).toBe(404);
  });
});

describe("config", () => {
  it("defaults to loopback and port 4000", () => {
    const config = loadConfig({});
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4000);
  });

  it("reads the port from the environment", () => {
    expect(loadConfig({ OBSERVATORY_PORT: "4321" }).port).toBe(4321);
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ OBSERVATORY_PORT: "not-a-port" })).toThrow(
      /Invalid OBSERVATORY_PORT/,
    );
  });
});
