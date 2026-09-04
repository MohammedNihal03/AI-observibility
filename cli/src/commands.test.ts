import type { SessionSummary } from "@observatory/shared";
import { describe, expect, it } from "vitest";

import { ServerUnreachableError, type ApiClient } from "./api.js";
import {
  doctorReport,
  openDashboard,
  resolveDashboardUrl,
  runChecks,
  sessionsReport,
  statusReport,
} from "./commands.js";

/**
 * `status`, `sessions`, `dashboard` and `doctor` (BUILD.md section 33).
 *
 * Driven with a stub client, so none of these reach a server, a browser, or a
 * developer's real Claude Code directory.
 */

const SESSION = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id: "demo_improving_9E21",
  source: "claude_code",
  model: "claude-opus-5",
  goal: "Fix the failing auth token refresh tests",
  startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  endedAt: null,
  status: "active",
  simulated: true,
  eventCount: 65,
  health: 74,
  learning: 73,
  state: "improving",
  ...overrides,
});

function stubClient(options: { sessions?: SessionSummary[]; down?: boolean } = {}): ApiClient {
  const fail = (): never => {
    throw new ServerUnreachableError("http://test");
  };

  return {
    server: "http://test",
    health: () =>
      options.down === true
        ? Promise.reject(new ServerUnreachableError("http://test"))
        : Promise.resolve({
            status: "ok",
            version: "0.1.0",
            contractVersion: 1,
            uptimeSeconds: 42,
            subscribers: 2,
            database: { location: "data/observatory.db", sessions: options.sessions?.length ?? 0 },
          }),
    listSessions: () =>
      options.down === true
        ? Promise.reject(new ServerUnreachableError("http://test"))
        : Promise.resolve({ sessions: options.sessions ?? [] }),
    createSession: fail,
    getSession: fail,
    sendEvent: fail,
    sendEvents: fail,
    endSession: fail,
    compareSessions: fail,
    compareGroups: fail,
  };
}

describe("status", () => {
  it("reports what the server is doing", async () => {
    const report = await statusReport({ client: stubClient({ sessions: [SESSION()] }) });

    expect(report).toContain("http://test");
    expect(report).toContain("data/observatory.db");
    expect(report).toContain("1 recorded, 1 active");
    expect(report).toContain("2 dashboards attached");
    expect(report).toContain("improving");
  });

  it("says nothing about a latest session when there is none", async () => {
    const report = await statusReport({ client: stubClient() });
    expect(report).toContain("0 recorded, 0 active");
    expect(report).not.toContain("Latest");
  });

  it("surfaces an unreachable server as an error the entry point can format", async () => {
    await expect(statusReport({ client: stubClient({ down: true }) })).rejects.toBeInstanceOf(
      ServerUnreachableError,
    );
  });
});

describe("sessions", () => {
  it("tabulates sessions with their scores", async () => {
    const report = await sessionsReport({
      client: stubClient({
        sessions: [
          SESSION(),
          SESSION({ id: "cc_abc", simulated: false, state: "degrading", health: 35 }),
        ],
      }),
    });

    expect(report).toContain("SESSION");
    expect(report).toContain("demo_improving_9E21");
    expect(report).toContain("cc_abc");
    // A simulated session says so in place of its source.
    expect(report).toContain("simulated");
    expect(report).toContain("claude_code");
    expect(report).toContain("▼ degrading");
  });

  it("tells a new user what to do instead of showing an empty table", async () => {
    const report = await sessionsReport({ client: stubClient() });
    expect(report).toContain("No sessions recorded yet");
    expect(report).toContain("observatory demo");
    expect(report).toContain("observatory import");
  });

  it("emits JSON on request", async () => {
    const report = await sessionsReport({
      client: stubClient({ sessions: [SESSION()] }),
      json: true,
    });
    const parsed = JSON.parse(report) as SessionSummary[];
    expect(parsed[0]?.id).toBe("demo_improving_9E21");
  });

  it("honours a limit", async () => {
    const report = await sessionsReport({
      client: stubClient({ sessions: [SESSION(), SESSION({ id: "second" })] }),
      json: true,
      limit: 1,
    });
    expect(JSON.parse(report)).toHaveLength(1);
  });
});

describe("dashboard", () => {
  it("returns the URL without launching anything when printing", () => {
    let launched = false;
    const url = openDashboard({
      print: true,
      open: () => {
        launched = true;
      },
    });
    expect(url).toBe("http://127.0.0.1:4001");
    expect(launched).toBe(false);
  });

  it("launches the browser at the dashboard URL", () => {
    const opened: string[] = [];
    openDashboard({ open: (target) => opened.push(target) });
    expect(opened).toEqual(["http://127.0.0.1:4001"]);
  });

  it("accepts an override", () => {
    const opened: string[] = [];
    openDashboard({ url: "http://localhost:9999", open: (target) => opened.push(target) });
    expect(opened).toEqual(["http://localhost:9999"]);
  });

  it("points a packaged install at the API, which serves the dashboard itself", () => {
    expect(resolveDashboardUrl({ packaged: true, server: "http://127.0.0.1:4000" })).toBe(
      "http://127.0.0.1:4000",
    );
    expect(resolveDashboardUrl({ packaged: true, server: "http://127.0.0.1:5000" })).toBe(
      "http://127.0.0.1:5000",
    );
  });

  it("uses the separate dev server port from a checkout", () => {
    expect(resolveDashboardUrl()).toBe("http://127.0.0.1:4001");
  });
});

describe("doctor", () => {
  it("checks the whole local setup", async () => {
    const checks = await runChecks({
      client: stubClient({ sessions: [SESSION()] }),
      home: "/nonexistent-home",
      dashboardUrl: "http://127.0.0.1:1",
    });

    const names = checks.map((check) => check.name);
    expect(names).toContain("Node.js");
    expect(names).toContain("API server");
    expect(names).toContain("Claude Code");
    expect(names).toContain("Scoring config");
    expect(names).toContain("Secret redaction");
  });

  it("verifies the scoring weights actually sum to 1", async () => {
    const checks = await runChecks({ client: stubClient(), home: "/nonexistent-home" });
    expect(checks.find((check) => check.name === "Scoring config")?.status).toBe("ok");
  });

  it("confirms redaction has patterns loaded", async () => {
    const checks = await runChecks({ client: stubClient(), home: "/nonexistent-home" });
    const redaction = checks.find((check) => check.name === "Secret redaction");
    expect(redaction?.status).toBe("ok");
    expect(redaction?.detail).toMatch(/\d+ credential formats/);
  });

  it("warns rather than fails when the server is simply not running", async () => {
    const checks = await runChecks({
      client: stubClient({ down: true }),
      home: "/nonexistent-home",
    });
    const server = checks.find((check) => check.name === "API server");
    expect(server?.status).toBe("warn");
    expect(server?.remedy).toContain("observatory start");
  });

  it("reports Codex as a gap rather than pretending it works", async () => {
    const checks = await runChecks({ client: stubClient(), home: "/nonexistent-home" });
    const codex = checks.find((check) => check.name === "Codex");
    expect(codex?.status).toBe("warn");
    expect(codex?.detail).toContain("not implemented");
  });

  it("gives every non-ok check something to do about it", async () => {
    const checks = await runChecks({
      client: stubClient({ down: true }),
      home: "/nonexistent-home",
    });
    for (const check of checks) {
      if (check.status !== "ok") expect(check.remedy).toBeTruthy();
    }
  });

  it("summarises without claiming everything is fine when it is not", async () => {
    const report = await doctorReport({
      client: stubClient({ down: true }),
      home: "/nonexistent-home",
      dashboardUrl: "http://127.0.0.1:1",
    });
    expect(report).toContain("observatory doctor");
    expect(report).not.toContain("Everything checks out");
    expect(report).toContain("not set up");
  });
});
