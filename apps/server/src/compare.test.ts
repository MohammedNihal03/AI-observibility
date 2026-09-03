import { generateDemoSession, type DemoScenario } from "@observatory/collectors";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { compareGroups, compareSessions, type GroupComparison } from "./compare.js";
import { createDatabase, type DatabaseHandle } from "./db/client.js";

/**
 * Session, model and prompt comparison (BUILD.md section 65, V2).
 *
 * Built on the demo scenarios, whose verdicts are known: an improving session
 * really should compare favourably against a degrading one, and if it does not
 * the comparison is wrong rather than the scenarios.
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

async function seed(
  instance: ReturnType<typeof createApp>,
  scenario: DemoScenario,
  overrides: { id?: string; model?: string; goal?: string } = {},
): Promise<string> {
  const demo = generateDemoSession({ scenario });
  const id = overrides.id ?? demo.sessionId;

  await instance.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      id,
      source: demo.source,
      model: overrides.model ?? demo.model,
      goal: overrides.goal ?? demo.goal,
      goalKeywords: [...demo.goalKeywords],
      startedAt: demo.startedAt,
    },
  });

  await instance.inject({
    method: "POST",
    url: `/api/sessions/${id}/events`,
    payload: { events: demo.events },
  });

  return id;
}

describe("compareSessions", () => {
  it("shows the improving session ahead of the degrading one", async () => {
    const instance = buildApp();
    const degrading = await seed(instance, "degrading", { id: "left" });
    const improving = await seed(instance, "improving", { id: "right" });

    const comparison = compareSessions(instance.store, degrading, improving);
    expect(comparison).toBeDefined();

    const health = comparison?.deltas.find((delta) => delta.metric === "health");
    expect(health?.delta).toBeGreaterThan(0);
    expect(health?.better).toBe(true);

    const errors = comparison?.deltas.find((delta) => delta.metric === "errorRate");
    // Fewer errors is better, so a negative delta is an improvement.
    expect(errors?.delta).toBeLessThan(0);
    expect(errors?.better).toBe(true);
  });

  it("lists the signals each session raised and the other did not", async () => {
    const instance = buildApp();
    const left = await seed(instance, "stable", { id: "l" });
    const right = await seed(instance, "degrading", { id: "r" });

    const comparison = compareSessions(instance.store, left, right);
    expect(comparison?.onlyRightSignals.length).toBeGreaterThan(0);
    expect(comparison?.onlyRightSignals.join(" ")).toMatch(/row|recovery|context|approach/i);
  });

  it("reports an unmeasurable metric as unknown rather than as no change", async () => {
    const instance = buildApp();
    const left = await seed(instance, "stable", { id: "a" });

    // A session with no events has no measurable anything.
    await instance.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { id: "empty", source: "claude_code" },
    });

    const comparison = compareSessions(instance.store, left, "empty");
    const health = comparison?.deltas.find((delta) => delta.metric === "health");
    expect(health?.right).toBeNull();
    expect(health?.delta).toBeNull();
    expect(health?.better).toBeNull();
  });

  it("404s through the API for a session that does not exist", async () => {
    const instance = buildApp();
    await seed(instance, "stable", { id: "only" });

    const response = await instance.inject({
      method: "GET",
      url: "/api/compare?left=only&right=missing",
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("compareGroups", () => {
  it("groups by model and reports medians", async () => {
    const instance = buildApp();
    await seed(instance, "improving", { id: "a1", model: "claude-opus-5" });
    await seed(instance, "improving", { id: "a2", model: "claude-opus-5" });
    await seed(instance, "degrading", { id: "b1", model: "claude-sonnet-5" });

    const result = compareGroups(instance.store, "model");
    expect(result.groups).toHaveLength(2);

    const opus = result.groups.find((group) => group.key === "claude-opus-5");
    const sonnet = result.groups.find((group) => group.key === "claude-sonnet-5");

    expect(opus?.sessions).toBe(2);
    expect(sonnet?.sessions).toBe(1);
    expect(opus?.health ?? 0).toBeGreaterThan(sonnet?.health ?? 100);
    expect(opus?.states.improving).toBe(2);
    expect(sonnet?.states.degrading).toBe(1);
  });

  it("groups by goal, which is the prompt comparison", async () => {
    const instance = buildApp();
    await seed(instance, "improving", { id: "p1", goal: "Fix the auth tests" });
    await seed(instance, "degrading", { id: "p2", goal: "make it work" });

    const result = compareGroups(instance.store, "goal");
    expect(result.groups.map((group) => group.key).sort()).toEqual([
      "Fix the auth tests",
      "make it work",
    ]);
  });

  it("counts sessions with no value for the key instead of inventing one", async () => {
    const instance = buildApp();
    await seed(instance, "stable", { id: "with-model" });
    await instance.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { id: "no-model", source: "claude_code" },
    });
    await instance.inject({
      method: "POST",
      url: "/api/sessions/no-model/events",
      payload: { source: "claude_code", type: "user_message" },
    });

    const result = compareGroups(instance.store, "model");
    expect(result.ungrouped).toBe(1);
    expect(result.groups.every((group) => group.key !== "")).toBe(true);
  });

  it("uses a median so one disaster cannot define a model", async () => {
    const instance = buildApp();
    await seed(instance, "improving", { id: "m1", model: "same" });
    await seed(instance, "improving", { id: "m2", model: "same" });
    await seed(instance, "degrading", { id: "m3", model: "same" });

    const result = compareGroups(instance.store, "model");
    const group = result.groups[0];

    // Two improving sessions and one degrading: the median sits with the pair,
    // where a mean would be dragged toward the outlier.
    expect(group?.sessions).toBe(3);
    expect(group?.states.improving).toBe(2);
    expect(group?.health ?? 0).toBeGreaterThan(50);
  });

  it("serves the same thing over the API", async () => {
    const instance = buildApp();
    await seed(instance, "improving", { id: "x1", model: "one" });
    await seed(instance, "degrading", { id: "x2", model: "two" });

    const response = await instance.inject({ method: "GET", url: "/api/compare?by=model" });
    expect(response.statusCode).toBe(200);

    const body = response.json<GroupComparison>();
    expect(body.groupBy).toBe("model");
    expect(body.groups).toHaveLength(2);
  });

  it("rejects a comparison with neither a grouping nor two sessions", async () => {
    const response = await buildApp().inject({ method: "GET", url: "/api/compare?left=only" });
    expect(response.statusCode).toBe(400);
  });
});
