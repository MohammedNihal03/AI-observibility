import { afterEach, describe, expect, it } from "vitest";

import { createApp, type HealthResponse } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase, type DatabaseHandle } from "./db/client.js";

let app: ReturnType<typeof createApp> | undefined;
let database: DatabaseHandle | undefined;

/** Tests always run against an ephemeral database - never the developer's file. */
function buildApp(): ReturnType<typeof createApp> {
  database = createDatabase({ file: ":memory:" });
  app = createApp({ database });
  return app;
}

afterEach(async () => {
  await app?.close();
  database?.close();
  app = undefined;
  database = undefined;
});

describe("server", () => {
  it("answers GET /api/health", async () => {
    const response = await buildApp().inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json<HealthResponse>();
    expect(body.status).toBe("ok");
    expect(body.contractVersion).toBe(1);
    expect(Number.isFinite(Date.parse(body.time))).toBe(true);
  });

  it("reports the database in health", async () => {
    const instance = buildApp();
    instance.store.sessions.create({ source: "claude_code" });

    const body = (
      await instance.inject({ method: "GET", url: "/api/health" })
    ).json<HealthResponse>();
    expect(body.database.location).toBe("memory");
    expect(body.database.sessions).toBe(1);
  });

  it("exposes the store to routes", () => {
    const instance = buildApp();
    expect(typeof instance.store.sessions.create).toBe("function");
    expect(typeof instance.store.events.append).toBe("function");
  });

  it("returns 404 for unknown routes", async () => {
    const response = await buildApp().inject({ method: "GET", url: "/api/nope" });
    expect(response.statusCode).toBe(404);
  });

  it("leaves an injected database open for its owner to close", async () => {
    const instance = buildApp();
    await instance.close();
    app = undefined;
    // Still usable: the app did not close a handle it does not own.
    expect(() => database?.sqlite.pragma("user_version")).not.toThrow();
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

  it("reads the database path from the environment", () => {
    expect(loadConfig({ OBSERVATORY_DB: ":memory:" }).databaseFile).toBe(":memory:");
    expect(loadConfig({}).databaseFile).toBeUndefined();
  });
});
