import { generateDemoSession } from "@observatory/collectors";
import type { SessionSnapshot, SessionSummary, StreamMessage } from "@observatory/shared";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { createDatabase, type DatabaseHandle } from "./db/client.js";
import type { Subscriber } from "./hub.js";

/**
 * The API surface of BUILD.md section 32 and the broadcast order of section 31.
 *
 * Driven with `app.inject`, so no socket is opened and the tests stay
 * deterministic. The events come from the demo generator: the API is exercised
 * with exactly the payloads a collector will send it.
 */

let app: ReturnType<typeof createApp> | undefined;
let database: DatabaseHandle | undefined;

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

/** Creates a session and posts a whole generated scenario into it. */
async function seed(
  instance: ReturnType<typeof createApp>,
  scenario: "improving" | "stable" | "degrading" = "improving",
): Promise<{ sessionId: string; events: number }> {
  const demo = generateDemoSession({ scenario });

  const created = await instance.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      id: demo.sessionId,
      source: demo.source,
      model: demo.model,
      goal: demo.goal,
      goalKeywords: [...demo.goalKeywords],
      startedAt: demo.startedAt,
    },
  });
  expect(created.statusCode).toBe(201);

  const posted = await instance.inject({
    method: "POST",
    url: `/api/sessions/${demo.sessionId}/events`,
    payload: { events: demo.events },
  });
  expect(posted.statusCode).toBe(202);

  return { sessionId: demo.sessionId, events: demo.events.length };
}

/** A socket stand-in that records what the hub sent it. */
function recorder(): Subscriber & { messages: StreamMessage[] } {
  const messages: StreamMessage[] = [];
  return {
    messages,
    readyState: 1,
    send(data: string) {
      messages.push(JSON.parse(data) as StreamMessage);
    },
  };
}

describe("POST /api/sessions", () => {
  it("creates a session", async () => {
    const response = await buildApp().inject({
      method: "POST",
      url: "/api/sessions",
      payload: { source: "claude_code", model: "claude-opus-5" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ id: string; status: string }>();
    expect(body.id).toBeTruthy();
    expect(body.status).toBe("active");
  });

  it("rejects a session with no source", async () => {
    const response = await buildApp().inject({
      method: "POST",
      url: "/api/sessions",
      payload: { model: "claude-opus-5" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe("invalid_session");
  });
});

describe("POST /api/sessions/:id/events", () => {
  it("accepts a batch and reports how many landed", async () => {
    const instance = buildApp();
    const { sessionId, events } = await seed(instance);
    expect(instance.store.events.count(sessionId)).toBe(events);
  });

  it("accepts a single event object", async () => {
    const instance = buildApp();
    const { sessionId } = await seed(instance);

    const response = await instance.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/events`,
      payload: {
        source: "claude_code",
        type: "tool_call",
        tool: { name: "Bash", command: "npm run build" },
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json<{ accepted: number }>().accepted).toBe(1);
  });

  it("redacts secrets before they reach the database (section 48)", async () => {
    const instance = buildApp();
    const { sessionId } = await seed(instance);

    const response = await instance.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/events`,
      payload: {
        source: "claude_code",
        type: "tool_call",
        tool: { name: "Bash", command: "deploy --token sk-ant-abcdefghijklmnopqrstuvwxyz" },
      },
    });

    expect(response.json<{ redactions: number }>().redactions).toBeGreaterThan(0);
    const stored = instance.store.events.list(sessionId, { limit: 1000 });
    const commands = stored.map((event) => event.tool?.command ?? "").join(" ");
    expect(commands).not.toContain("sk-ant-abcdefghijklmnopqrstuvwxyz");
    expect(commands).toContain("[REDACTED:");
  });

  it("refuses an event for a session that does not exist", async () => {
    const response = await buildApp().inject({
      method: "POST",
      url: "/api/sessions/nope/events",
      payload: { source: "claude_code", type: "user_message" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("rejects a malformed event", async () => {
    const instance = buildApp();
    const { sessionId } = await seed(instance);
    const response = await instance.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/events`,
      payload: { source: "claude_code", type: "not_a_real_type" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("GET /api/sessions/:id", () => {
  it("serves a snapshot the engine agrees with", async () => {
    const instance = buildApp();
    const { sessionId, events } = await seed(instance, "improving");

    const response = await instance.inject({ method: "GET", url: `/api/sessions/${sessionId}` });
    expect(response.statusCode).toBe(200);

    const snapshot = response.json<SessionSnapshot>();
    expect(snapshot.session.id).toBe(sessionId);
    expect(snapshot.session.eventCount).toBe(events);
    expect(snapshot.session.simulated).toBe(true);
    expect(snapshot.scores.state).toBe("improving");
    expect(snapshot.scores.health).toBeGreaterThan(0);
    expect(snapshot.reasons.length).toBeGreaterThan(0);
    expect(snapshot.windows).toHaveLength(3);
    expect(snapshot.timeline.length).toBeGreaterThan(0);
  });

  it("ends the progress curve on the headline score", async () => {
    const instance = buildApp();
    const { sessionId } = await seed(instance, "degrading");

    const snapshot = (
      await instance.inject({ method: "GET", url: `/api/sessions/${sessionId}` })
    ).json<SessionSnapshot>();

    const last = snapshot.trend[snapshot.trend.length - 1];
    expect(last?.health).toBe(snapshot.scores.health);
    expect(snapshot.scores.state).toBe("degrading");
  });

  it("reports the context window the agent stated, and nothing when it did not", async () => {
    const instance = buildApp();
    const { sessionId } = await seed(instance);
    const snapshot = (
      await instance.inject({ method: "GET", url: `/api/sessions/${sessionId}` })
    ).json<SessionSnapshot>();

    expect(snapshot.session.contextWindow).toBe(200_000);
    expect(snapshot.metrics.context.maximumSource).toBe("reported");
  });

  it("404s for an unknown session", async () => {
    const response = await buildApp().inject({ method: "GET", url: "/api/sessions/nope" });
    expect(response.statusCode).toBe(404);
  });
});

describe("GET /api/sessions", () => {
  it("lists sessions with their headline scores", async () => {
    const instance = buildApp();
    await seed(instance, "improving");
    await seed(instance, "degrading");

    const body = (await instance.inject({ method: "GET", url: "/api/sessions" })).json<{
      sessions: SessionSummary[];
      count: number;
    }>();

    expect(body.count).toBe(2);
    const states = body.sessions.map((session) => session.state).sort();
    expect(states).toEqual(["degrading", "improving"]);
    expect(body.sessions.every((session) => session.simulated)).toBe(true);
  });

  it("returns an empty list rather than an error when nothing is recorded", async () => {
    const body = (await buildApp().inject({ method: "GET", url: "/api/sessions" })).json<{
      sessions: SessionSummary[];
    }>();
    expect(body.sessions).toEqual([]);
  });
});

describe("report endpoints", () => {
  it("serves metrics, health and timeline for a session", async () => {
    const instance = buildApp();
    const { sessionId } = await seed(instance);

    const metrics = (
      await instance.inject({ method: "GET", url: `/api/sessions/${sessionId}/metrics` })
    ).json<{ metrics: { successRate: number }; windows: unknown[]; trend: unknown[] }>();
    expect(metrics.windows).toHaveLength(3);
    expect(metrics.trend.length).toBeGreaterThan(1);

    const health = (
      await instance.inject({ method: "GET", url: `/api/sessions/${sessionId}/health` })
    ).json<{ health: number; reasons: unknown[]; healthComponents: unknown[] }>();
    // Section 27: a score never travels without the reasons behind it.
    expect(health.reasons.length).toBeGreaterThan(0);
    expect(health.healthComponents).toHaveLength(5);

    const timeline = (
      await instance.inject({ method: "GET", url: `/api/sessions/${sessionId}/timeline` })
    ).json<{ timeline: { kind: string }[] }>();
    expect(timeline.timeline.some((entry) => entry.kind === "fail")).toBe(true);
  });

  it("404s every report for an unknown session", async () => {
    const instance = buildApp();
    for (const path of ["metrics", "health", "timeline", "events"]) {
      const response = await instance.inject({ method: "GET", url: `/api/sessions/nope/${path}` });
      expect(response.statusCode).toBe(404);
    }
  });
});

describe("broadcast (section 31)", () => {
  it("pushes each event and then the recomputed snapshot", async () => {
    const instance = buildApp();
    const { sessionId } = await seed(instance);

    const socket = recorder();
    instance.hub.subscribe(sessionId, socket);

    await instance.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/events`,
      payload: {
        source: "claude_code",
        type: "tool_call",
        tool: { name: "Bash", command: "npm run verify" },
      },
    });

    expect(socket.messages.map((message) => message.type)).toEqual(["event", "snapshot"]);
    const last = socket.messages[1];
    expect(last?.type === "snapshot" && last.snapshot.session.id).toBe(sessionId);
  });

  it("recomputes the scores it broadcasts, rather than sending a stale copy", async () => {
    const instance = buildApp();
    const { sessionId } = await seed(instance);

    const socket = recorder();
    instance.hub.subscribe(sessionId, socket);

    const before = (
      await instance.inject({ method: "GET", url: `/api/sessions/${sessionId}` })
    ).json<SessionSnapshot>();

    await instance.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/events`,
      payload: [
        { source: "claude_code", type: "tool_call", tool: { name: "Bash", command: "npm test" } },
        {
          source: "claude_code",
          type: "tool_result",
          result: { status: "error", exitCode: 1, confidence: "reported" },
        },
      ],
    });

    const pushed = socket.messages.find((message) => message.type === "snapshot");
    expect(pushed?.type).toBe("snapshot");
    if (pushed?.type !== "snapshot") throw new Error("expected a snapshot");
    expect(pushed.snapshot.session.eventCount).toBe(before.session.eventCount + 2);
    expect(pushed.snapshot.metrics.counters.errors).toBeGreaterThan(
      before.metrics.counters.errors,
    );
  });

  it("delivers only to subscribers of that session", async () => {
    const instance = buildApp();
    const first = await seed(instance, "improving");
    const second = await seed(instance, "stable");

    const listener = recorder();
    instance.hub.subscribe(second.sessionId, listener);

    await instance.inject({
      method: "POST",
      url: `/api/sessions/${first.sessionId}/events`,
      payload: { source: "claude_code", type: "user_message" },
    });

    expect(listener.messages).toEqual([]);
  });

  it("announces the end of a session", async () => {
    const instance = buildApp();
    const { sessionId } = await seed(instance);

    const socket = recorder();
    instance.hub.subscribe(sessionId, socket);

    const response = await instance.inject({
      method: "PATCH",
      url: `/api/sessions/${sessionId}`,
      payload: { status: "completed", endedAt: new Date().toISOString() },
    });

    expect(response.statusCode).toBe(200);
    expect(socket.messages.map((message) => message.type)).toContain("session_ended");
  });

  it("counts subscribers in health", async () => {
    const instance = buildApp();
    const { sessionId } = await seed(instance);
    const unsubscribe = instance.hub.subscribe(sessionId, recorder());

    const body = (await instance.inject({ method: "GET", url: "/api/health" })).json<{
      subscribers: number;
    }>();
    expect(body.subscribers).toBe(1);

    unsubscribe();
    expect(instance.hub.subscriberCount()).toBe(0);
  });
});
