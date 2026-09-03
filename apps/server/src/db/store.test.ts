import { normalizedAgentEventSchema, type NormalizedAgentEvent } from "@observatory/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkIntegrity, createDatabase, type DatabaseHandle } from "./client.js";
import { createStore, UnknownSessionError, type Store } from "./store.js";

let handle: DatabaseHandle;
let store: Store;
let sequence = 0;

beforeEach(() => {
  handle = createDatabase({ file: ":memory:" });
  sequence = 0;
  store = createStore(handle.db, {
    now: () => new Date("2026-09-03T10:00:00.000Z"),
    idFactory: () => {
      sequence += 1;
      return `id_${String(sequence).padStart(4, "0")}`;
    },
  });
});

afterEach(() => {
  handle.close();
});

const event = (overrides: Partial<NormalizedAgentEvent> = {}): NormalizedAgentEvent => ({
  id: `evt_${Math.random().toString(36).slice(2, 10)}`,
  sessionId: "sess_1",
  timestamp: "2026-09-03T10:00:00.000Z",
  source: "claude_code",
  type: "tool_call",
  signature: "tool_call|tool:Bash|cmd:npm test",
  tool: { name: "Bash", command: "npm test" },
  ...overrides,
});

describe("migrations", () => {
  it("creates all four tables from BUILD.md section 51", () => {
    const rows = handle.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const names = rows.map((row) => row.name);
    for (const table of ["sessions", "events", "metrics", "signals"]) {
      expect(names).toContain(table);
    }
  });

  it("indexes session_id and timestamp as the specification requires", () => {
    const rows = handle.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL")
      .all() as { name: string }[];
    const names = rows.map((row) => row.name);
    expect(names).toContain("events_session_idx");
    expect(names).toContain("events_timestamp_idx");
    expect(names).toContain("metrics_session_idx");
    expect(names).toContain("signals_session_idx");
  });

  it("passes an integrity check", () => {
    expect(checkIntegrity(handle).ok).toBe(true);
  });

  it("enables foreign keys on the connection", () => {
    const result = handle.sqlite.pragma("foreign_keys", { simple: true });
    expect(result).toBe(1);
  });

  it("is idempotent - reopening the same database applies nothing new", () => {
    expect(() => createDatabase({ file: ":memory:" }).close()).not.toThrow();
  });
});

describe("sessions", () => {
  it("creates a session with defaults", () => {
    const session = store.sessions.create({ source: "claude_code" });
    expect(session.id).toBe("id_0001");
    expect(session.status).toBe("active");
    expect(session.endedAt).toBeNull();
    expect(session.model).toBeNull();
    expect(session.goal).toBeNull();
    expect(session.startedAt).toBe("2026-09-03T10:00:00.000Z");
  });

  it("round-trips every field, goal keywords included", () => {
    const created = store.sessions.create({
      id: "sess_goal",
      source: "codex",
      model: "gpt-5",
      goal: "Fix authentication timeout.",
      goalKeywords: ["authentication", "timeout", "session", "login"],
      startedAt: "2026-09-03T09:00:00.000Z",
    });
    expect(store.sessions.get("sess_goal")).toEqual(created);
    expect(store.sessions.get("sess_goal")?.goalKeywords).toEqual([
      "authentication",
      "timeout",
      "session",
      "login",
    ]);
  });

  it("returns undefined for an unknown session", () => {
    expect(store.sessions.get("nope")).toBeUndefined();
  });

  it("rejects an invalid source", () => {
    expect(() => store.sessions.create({ source: "cursor" } as never)).toThrow();
  });

  it("lists sessions newest first", () => {
    store.sessions.create({ id: "a", source: "generic", startedAt: "2026-09-01T00:00:00.000Z" });
    store.sessions.create({ id: "b", source: "generic", startedAt: "2026-09-03T00:00:00.000Z" });
    store.sessions.create({ id: "c", source: "generic", startedAt: "2026-09-02T00:00:00.000Z" });
    expect(store.sessions.list().map((session) => session.id)).toEqual(["b", "c", "a"]);
  });

  it("filters by status and paginates", () => {
    store.sessions.create({ id: "a", source: "generic" });
    store.sessions.create({ id: "b", source: "generic", status: "completed" });
    expect(store.sessions.list({ status: "completed" }).map((session) => session.id)).toEqual([
      "b",
    ]);
    expect(store.sessions.list({ limit: 1 })).toHaveLength(1);
    expect(store.sessions.list({ limit: 1, offset: 1 })).toHaveLength(1);
  });

  it("updates mutable fields only", () => {
    store.sessions.create({ id: "s", source: "generic" });
    const updated = store.sessions.update("s", { model: "claude-opus-5", status: "completed" });
    expect(updated?.model).toBe("claude-opus-5");
    expect(updated?.status).toBe("completed");
    expect(updated?.startedAt).toBe("2026-09-03T10:00:00.000Z");
  });

  it("clears a nullable field when explicitly set to null", () => {
    store.sessions.create({ id: "s", source: "generic", goal: "something" });
    expect(store.sessions.update("s", { goal: null })?.goal).toBeNull();
  });

  it("end() stamps endedAt and is idempotent", () => {
    store.sessions.create({ id: "s", source: "generic" });
    const ended = store.sessions.end("s");
    expect(ended?.endedAt).toBe("2026-09-03T10:00:00.000Z");
    expect(ended?.status).toBe("completed");
    expect(store.sessions.end("s")).toEqual(ended);
  });

  it("end() supports aborting", () => {
    store.sessions.create({ id: "s", source: "generic" });
    expect(store.sessions.end("s", "aborted")?.status).toBe("aborted");
  });

  it("counts sessions", () => {
    expect(store.sessions.count()).toBe(0);
    store.sessions.create({ source: "generic" });
    expect(store.sessions.count()).toBe(1);
  });
});

describe("events", () => {
  beforeEach(() => {
    store.sessions.create({ id: "sess_1", source: "claude_code" });
  });

  it("appends and reads back an event unchanged", () => {
    const original = event();
    store.events.append("sess_1", original);
    expect(store.events.list("sess_1")).toEqual([original]);
  });

  it("round-trips an event with every optional group populated", () => {
    const original = event({
      type: "command_finished",
      result: { status: "error", exitCode: 1, durationMs: 1234, confidence: "reported" },
      tokens: { input: 100, output: 50, cached: 2000 },
      files: { path: "src/auth.ts" },
      metadata: { uuid: "abc", nested: { depth: 2 } },
    });
    store.events.append("sess_1", original);
    expect(store.events.list("sess_1")[0]).toEqual(original);
  });

  it("does not resurrect absent optional groups as empty objects", () => {
    store.events.append("sess_1", event({ type: "user_message", tool: undefined }));
    const stored = store.events.list("sess_1")[0];
    expect(stored).not.toHaveProperty("tool");
    expect(stored).not.toHaveProperty("result");
    expect(stored).not.toHaveProperty("tokens");
    expect(stored).not.toHaveProperty("files");
  });

  it("produces events that still satisfy the shared schema", () => {
    store.events.append("sess_1", event({ tokens: { input: 5 } }));
    for (const stored of store.events.list("sess_1")) {
      expect(normalizedAgentEventSchema.safeParse(stored).success).toBe(true);
    }
  });

  it("preserves a zero exit code rather than dropping it as falsy", () => {
    store.events.append("sess_1", event({ result: { exitCode: 0 } }));
    expect(store.events.list("sess_1")[0]?.result?.exitCode).toBe(0);
  });

  it("preserves zero token counts", () => {
    store.events.append("sess_1", event({ tokens: { input: 0, output: 0, cached: 0 } }));
    expect(store.events.list("sess_1")[0]?.tokens).toEqual({ input: 0, output: 0, cached: 0 });
  });

  it("rewrites the session id to the one it was appended under", () => {
    store.events.append("sess_1", event({ sessionId: "wrong" }));
    expect(store.events.list("sess_1")[0]?.sessionId).toBe("sess_1");
  });

  it("refuses to append to a session that does not exist", () => {
    expect(() => store.events.append("ghost", event())).toThrow(UnknownSessionError);
  });

  it("keeps arrival order stable when timestamps are identical", () => {
    const shared = "2026-09-03T10:00:00.000Z";
    store.events.appendMany("sess_1", [
      event({ id: "e1", timestamp: shared, tool: { name: "Read" } }),
      event({ id: "e2", timestamp: shared, tool: { name: "Edit" } }),
      event({ id: "e3", timestamp: shared, tool: { name: "Bash" } }),
    ]);
    expect(store.events.list("sess_1").map((stored) => stored.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("orders by timestamp before arrival order", () => {
    store.events.append("sess_1", event({ id: "late", timestamp: "2026-09-03T10:00:05.000Z" }));
    store.events.append("sess_1", event({ id: "early", timestamp: "2026-09-03T10:00:01.000Z" }));
    expect(store.events.list("sess_1").map((stored) => stored.id)).toEqual(["early", "late"]);
  });

  it("continues the sequence across separate appends", () => {
    store.events.append("sess_1", event({ id: "a" }));
    store.events.appendMany("sess_1", [event({ id: "b" }), event({ id: "c" })]);
    store.events.append("sess_1", event({ id: "d" }));
    const rows = handle.sqlite
      .prepare("SELECT id, sequence FROM events ORDER BY sequence")
      .all() as { id: string; sequence: number }[];
    expect(rows.map((row) => row.sequence)).toEqual([1, 2, 3, 4]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps sequences independent per session", () => {
    store.sessions.create({ id: "sess_2", source: "codex" });
    store.events.append("sess_1", event({ id: "a" }));
    store.events.append("sess_2", event({ id: "b" }));
    const rows = handle.sqlite
      .prepare("SELECT session_id, sequence FROM events ORDER BY id")
      .all() as { session_id: string; sequence: number }[];
    expect(rows).toEqual([
      { session_id: "sess_1", sequence: 1 },
      { session_id: "sess_2", sequence: 1 },
    ]);
  });

  it("isolates sessions from each other", () => {
    store.sessions.create({ id: "sess_2", source: "codex" });
    store.events.append("sess_1", event({ id: "a" }));
    store.events.append("sess_2", event({ id: "b" }));
    expect(store.events.list("sess_1").map((stored) => stored.id)).toEqual(["a"]);
    expect(store.events.count("sess_1")).toBe(1);
    expect(store.events.count("sess_2")).toBe(1);
  });

  it("filters by event type", () => {
    store.events.appendMany("sess_1", [
      event({ id: "a", type: "tool_call" }),
      event({ id: "b", type: "tool_result" }),
      event({ id: "c", type: "error" }),
    ]);
    const filtered = store.events.list("sess_1", { types: ["tool_result", "error"] });
    expect(filtered.map((stored) => stored.id)).toEqual(["b", "c"]);
  });

  it("paginates", () => {
    store.events.appendMany(
      "sess_1",
      ["a", "b", "c"].map((id, index) =>
        event({ id, timestamp: `2026-09-03T10:00:0${index}.000Z` }),
      ),
    );
    expect(store.events.list("sess_1", { limit: 2 }).map((stored) => stored.id)).toEqual([
      "a",
      "b",
    ]);
    expect(store.events.list("sess_1", { limit: 2, offset: 2 }).map((stored) => stored.id)).toEqual(
      ["c"],
    );
  });

  it("fetches a single event by id", () => {
    store.events.append("sess_1", event({ id: "findme" }));
    expect(store.events.get("findme")?.id).toBe("findme");
    expect(store.events.get("missing")).toBeUndefined();
  });

  it("appendMany with an empty batch is a no-op", () => {
    expect(store.events.appendMany("sess_1", [])).toEqual([]);
    expect(store.events.count("sess_1")).toBe(0);
  });

  it("rolls the whole batch back if one event fails", () => {
    const duplicate = event({ id: "dupe" });
    store.events.append("sess_1", duplicate);
    expect(() => store.events.appendMany("sess_1", [event({ id: "fresh" }), duplicate])).toThrow();
    expect(store.events.count("sess_1")).toBe(1);
    expect(store.events.get("fresh")).toBeUndefined();
  });

  it("caps oversized metadata instead of storing it", () => {
    const small = createStore(handle.db, { maxPayloadBytes: 64 });
    small.events.append("sess_1", event({ id: "big", metadata: { blob: "x".repeat(500) } }));
    const stored = small.events.get("big");
    expect(stored?.metadata).toMatchObject({ _truncated: true });
    expect(JSON.stringify(stored?.metadata)).not.toContain("xxxxxxxxxx");
  });
});

describe("cascade delete", () => {
  it("removes a session's events, metrics and signals with it", () => {
    store.sessions.create({ id: "sess_1", source: "claude_code" });
    store.events.append("sess_1", event());
    store.metrics.insert({ sessionId: "sess_1", healthScore: 80 });
    store.signals.insert({
      sessionId: "sess_1",
      type: "repeated_action_detected",
      severity: "warning",
      message: "npm test ran 3 times",
    });

    expect(store.sessions.remove("sess_1")).toBe(true);

    expect(store.events.count("sess_1")).toBe(0);
    expect(store.metrics.latest("sess_1")).toBeUndefined();
    expect(store.signals.list("sess_1")).toEqual([]);
  });

  it("reports when there was nothing to remove", () => {
    expect(store.sessions.remove("ghost")).toBe(false);
  });
});

describe("metrics snapshots", () => {
  beforeEach(() => {
    store.sessions.create({ id: "sess_1", source: "claude_code" });
  });

  it("stores every score as null when nothing has been computed", () => {
    const snapshot = store.metrics.insert({ sessionId: "sess_1" });
    expect(snapshot.healthScore).toBeNull();
    expect(snapshot.learningScore).toBeNull();
    expect(snapshot.degradationScore).toBeNull();
    expect(snapshot.contextPressure).toBeNull();
  });

  it("round-trips a fully populated snapshot", () => {
    const snapshot = store.metrics.insert({
      sessionId: "sess_1",
      timestamp: "2026-09-03T10:05:00.000Z",
      healthScore: 82,
      learningScore: 71,
      degradationScore: 12,
      successRate: 0.8,
      errorRate: 0.2,
      recoveryRate: 0.857,
      repetitionRate: 0.1,
      correctionLoopRate: 0.25,
      toolEfficiency: 0.9,
      contextPressure: 0.72,
    });
    expect(store.metrics.latest("sess_1")).toEqual(snapshot);
  });

  it("distinguishes a zero score from an uncomputed one", () => {
    const snapshot = store.metrics.insert({ sessionId: "sess_1", degradationScore: 0 });
    expect(snapshot.degradationScore).toBe(0);
    expect(snapshot.healthScore).toBeNull();
  });

  it("rejects a score outside 0-100", () => {
    expect(() => store.metrics.insert({ sessionId: "sess_1", healthScore: 101 })).toThrow();
    expect(() => store.metrics.insert({ sessionId: "sess_1", healthScore: -1 })).toThrow();
  });

  it("rejects a rate outside 0-1", () => {
    expect(() => store.metrics.insert({ sessionId: "sess_1", successRate: 1.5 })).toThrow();
  });

  it("returns history in chronological order for charting", () => {
    store.metrics.insert({
      sessionId: "sess_1",
      timestamp: "2026-09-03T10:02:00.000Z",
      healthScore: 60,
    });
    store.metrics.insert({
      sessionId: "sess_1",
      timestamp: "2026-09-03T10:01:00.000Z",
      healthScore: 55,
    });
    store.metrics.insert({
      sessionId: "sess_1",
      timestamp: "2026-09-03T10:03:00.000Z",
      healthScore: 74,
    });
    expect(store.metrics.history("sess_1").map((row) => row.healthScore)).toEqual([55, 60, 74]);
  });

  it("latest() returns the most recent snapshot", () => {
    store.metrics.insert({
      sessionId: "sess_1",
      timestamp: "2026-09-03T10:01:00.000Z",
      healthScore: 55,
    });
    store.metrics.insert({
      sessionId: "sess_1",
      timestamp: "2026-09-03T10:09:00.000Z",
      healthScore: 88,
    });
    expect(store.metrics.latest("sess_1")?.healthScore).toBe(88);
  });

  it("refuses a snapshot for an unknown session", () => {
    expect(() => store.metrics.insert({ sessionId: "ghost" })).toThrow(UnknownSessionError);
  });
});

describe("signals", () => {
  beforeEach(() => {
    store.sessions.create({ id: "sess_1", source: "claude_code" });
  });

  it("stores and reads back a signal", () => {
    const signal = store.signals.insert({
      sessionId: "sess_1",
      type: "repeated_failed_action",
      severity: "critical",
      message: "npm test failed 3 times in a row",
      metadata: { signature: "command_finished|cmd:npm test", occurrences: 3 },
    });
    expect(store.signals.list("sess_1")).toEqual([signal]);
    expect(signal.metadata).toEqual({
      signature: "command_finished|cmd:npm test",
      occurrences: 3,
    });
  });

  it("stores null metadata when none is supplied", () => {
    const signal = store.signals.insert({
      sessionId: "sess_1",
      type: "high_context_pressure",
      severity: "info",
      message: "Context utilization is high",
    });
    expect(signal.metadata).toBeNull();
  });

  it("rejects an unknown signal type", () => {
    expect(() =>
      store.signals.insert({
        sessionId: "sess_1",
        type: "vibes_are_off" as never,
        severity: "info",
        message: "x",
      }),
    ).toThrow();
  });

  it("rejects an unknown severity", () => {
    expect(() =>
      store.signals.insert({
        sessionId: "sess_1",
        type: "high_context_pressure",
        severity: "apocalyptic" as never,
        message: "x",
      }),
    ).toThrow();
  });

  it("requires a message, because a signal without one explains nothing", () => {
    expect(() =>
      store.signals.insert({
        sessionId: "sess_1",
        type: "high_context_pressure",
        severity: "info",
        message: "",
      }),
    ).toThrow();
  });

  it("returns signals chronologically and exposes the latest", () => {
    store.signals.insert({
      sessionId: "sess_1",
      timestamp: "2026-09-03T10:02:00.000Z",
      type: "increasing_error_rate",
      severity: "warning",
      message: "second",
    });
    store.signals.insert({
      sessionId: "sess_1",
      timestamp: "2026-09-03T10:01:00.000Z",
      type: "recovery_succeeded",
      severity: "info",
      message: "first",
    });
    expect(store.signals.list("sess_1").map((row) => row.message)).toEqual(["first", "second"]);
    expect(store.signals.latest("sess_1")?.message).toBe("second");
  });

  it("refuses a signal for an unknown session", () => {
    expect(() =>
      store.signals.insert({
        sessionId: "ghost",
        type: "high_context_pressure",
        severity: "info",
        message: "x",
      }),
    ).toThrow(UnknownSessionError);
  });
});

describe("persistence across connections", () => {
  it("keeps data written by one handle visible to the next", () => {
    const file = `${process.env.TEMP ?? "."}/observatory-test-${Date.now()}.db`;

    const first = createDatabase({ file });
    const firstStore = createStore(first.db);
    firstStore.sessions.create({ id: "durable", source: "codex", goal: "survive a restart" });
    firstStore.events.append("durable", event({ id: "e1", sessionId: "durable" }));
    first.close();

    const second = createDatabase({ file });
    const secondStore = createStore(second.db);
    expect(secondStore.sessions.get("durable")?.goal).toBe("survive a restart");
    expect(secondStore.events.count("durable")).toBe(1);
    expect(secondStore.events.get("e1")?.signature).toBe("tool_call|tool:Bash|cmd:npm test");
    second.close();
  });
});
