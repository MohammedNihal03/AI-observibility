import type { AgentEvent, AgentEventType } from "@observatory/shared";
import { describe, expect, it } from "vitest";

import { computeCounters, computeDurationMs, emptyCounters } from "./counters.js";

let sequence = 0;

function evt(type: AgentEventType, overrides: Partial<AgentEvent> = {}): AgentEvent {
  sequence += 1;
  return {
    id: `e${sequence}`,
    sessionId: "s",
    timestamp: "2026-09-03T10:00:00.000Z",
    source: "claude_code",
    type,
    ...overrides,
  };
}

describe("computeCounters - empty", () => {
  it("returns zeros for no events", () => {
    const counters = computeCounters([]);
    expect(counters).toEqual(emptyCounters());
    expect(counters.totalEvents).toBe(0);
  });
});

describe("computeCounters - totals", () => {
  it("counts events", () => {
    expect(computeCounters([evt("user_message"), evt("assistant_message")]).totalEvents).toBe(2);
  });

  it("counts tool calls", () => {
    const events = [evt("tool_call"), evt("tool_call"), evt("tool_result")];
    expect(computeCounters(events).totalToolCalls).toBe(2);
  });

  it("counts a file operation as a tool invocation too", () => {
    // Adapters emit semantic types for file tools, so these ARE tool calls and
    // must be in the same population as the tool_result events they produce.
    const events = [
      evt("file_read", { files: { path: "a.ts" } }),
      evt("file_edit", { files: { path: "a.ts" } }),
      evt("search"),
      evt("git_operation"),
      evt("command_started"),
      evt("user_message"),
    ];
    expect(computeCounters(events).totalToolCalls).toBe(5);
  });

  it("does not count outcome events as invocations", () => {
    const events = [evt("tool_result"), evt("command_finished"), evt("test_finished")];
    expect(computeCounters(events).totalToolCalls).toBe(0);
  });

  it("sums tokens across events", () => {
    const events = [
      evt("model_response", { tokens: { input: 100, output: 20, cached: 5000 } }),
      evt("model_response", { tokens: { input: 50, output: 10 } }),
    ];
    const counters = computeCounters(events);
    expect(counters.inputTokens).toBe(150);
    expect(counters.outputTokens).toBe(30);
    expect(counters.cachedTokens).toBe(5000);
  });

  it("counts warnings only from warning events", () => {
    const events = [evt("warning"), evt("warning"), evt("error")];
    expect(computeCounters(events).warnings).toBe(2);
  });
});

describe("computeCounters - errors follow section 14", () => {
  it("counts an error event", () => {
    expect(computeCounters([evt("error")]).errors).toBe(1);
  });

  it("counts a failed command as an error too", () => {
    const events = [evt("command_finished", { result: { exitCode: 1 } })];
    expect(computeCounters(events).errors).toBe(1);
  });

  it("counts a failed test as an error too", () => {
    const events = [evt("test_finished", { result: { status: "error" } })];
    expect(computeCounters(events).errors).toBe(1);
  });

  it("does not count a successful outcome as an error", () => {
    const events = [evt("command_finished", { result: { exitCode: 0 } })];
    expect(computeCounters(events).errors).toBe(0);
  });

  it("does not count an unreported outcome as an error", () => {
    expect(computeCounters([evt("tool_result")]).errors).toBe(0);
  });
});

describe("computeCounters - outcomes", () => {
  const events = [
    evt("tool_result", { result: { status: "success" } }),
    evt("tool_result", { result: { status: "success" } }),
    evt("tool_result", { result: { status: "error" } }),
    evt("tool_result", { result: { status: "unknown" } }),
  ];

  it("splits resolved outcomes into successes and failures", () => {
    const counters = computeCounters(events);
    expect(counters.successfulOutcomes).toBe(2);
    expect(counters.failedOutcomes).toBe(1);
    expect(counters.resolvedOutcomes).toBe(3);
  });

  it("keeps unresolved outcomes out of the resolved count", () => {
    expect(computeCounters(events).unresolvedOutcomes).toBe(1);
  });

  it("counts tool successes and failures from tool_result events", () => {
    const counters = computeCounters(events);
    expect(counters.successfulToolCalls).toBe(2);
    expect(counters.failedToolCalls).toBe(1);
  });

  it("does not count a failed shell command as a failed tool call", () => {
    const counters = computeCounters([evt("command_finished", { result: { exitCode: 1 } })]);
    expect(counters.failedToolCalls).toBe(0);
    expect(counters.errors).toBe(1);
  });

  it("reports tool calls whose outcome never arrived", () => {
    const counters = computeCounters([
      evt("tool_call"),
      evt("tool_call"),
      evt("tool_call"),
      evt("tool_result", { result: { status: "success" } }),
    ]);
    expect(counters.totalToolCalls).toBe(3);
    expect(counters.toolResults).toBe(1);
    expect(counters.unresolvedToolCalls).toBe(2);
  });

  it("never reports a negative unresolved count", () => {
    const counters = computeCounters([
      evt("tool_result", { result: { status: "success" } }),
      evt("tool_result", { result: { status: "success" } }),
    ]);
    expect(counters.unresolvedToolCalls).toBe(0);
  });

  it("keeps successful tool calls within the observed result population", () => {
    const counters = computeCounters([
      evt("file_read", { files: { path: "a.ts" } }),
      evt("tool_result", { result: { status: "success" } }),
      evt("file_edit", { files: { path: "a.ts" } }),
      evt("tool_result", { result: { status: "error" } }),
    ]);
    expect(counters.totalToolCalls).toBe(2);
    expect(counters.toolResults).toBe(2);
    expect(counters.successfulToolCalls).toBeLessThanOrEqual(counters.toolResults);
    expect(counters.unresolvedToolCalls).toBe(0);
  });

  it("counts tool results with no reported status", () => {
    const counters = computeCounters([evt("tool_call"), evt("tool_result")]);
    expect(counters.toolResults).toBe(1);
    expect(counters.unresolvedToolResults).toBe(1);
  });
});

describe("computeCounters - commands", () => {
  it("counts an explicit command_started", () => {
    expect(computeCounters([evt("command_started")]).commandsExecuted).toBe(1);
  });

  it("counts a tool call that carried a command", () => {
    const events = [evt("tool_call", { tool: { name: "Bash", command: "npm test" } })];
    expect(computeCounters(events).commandsExecuted).toBe(1);
  });

  it("does not count a tool call with no command", () => {
    const events = [evt("tool_call", { tool: { name: "Read" } })];
    expect(computeCounters(events).commandsExecuted).toBe(0);
  });

  it("does not count the finish event, only the start", () => {
    const events = [evt("command_started"), evt("command_finished")];
    expect(computeCounters(events).commandsExecuted).toBe(1);
  });
});

describe("computeCounters - files are distinct paths", () => {
  it("counts a file read once however often it is read", () => {
    const events = [
      evt("file_read", { files: { path: "src/auth.ts" } }),
      evt("file_read", { files: { path: "src/auth.ts" } }),
      evt("file_read", { files: { path: "src/db.ts" } }),
    ];
    expect(computeCounters(events).filesRead).toBe(2);
  });

  it("counts writes and edits together as modifications", () => {
    const events = [
      evt("file_edit", { files: { path: "a.ts" } }),
      evt("file_write", { files: { path: "b.ts" } }),
      evt("file_edit", { files: { path: "a.ts" } }),
    ];
    expect(computeCounters(events).filesModified).toBe(2);
  });

  it("keeps reads and modifications separate", () => {
    const events = [
      evt("file_read", { files: { path: "a.ts" } }),
      evt("file_edit", { files: { path: "a.ts" } }),
    ];
    const counters = computeCounters(events);
    expect(counters.filesRead).toBe(1);
    expect(counters.filesModified).toBe(1);
  });

  it("refuses to guess from a bare tool_call carrying a path", () => {
    const events = [evt("tool_call", { tool: { name: "Edit" }, files: { path: "a.ts" } })];
    const counters = computeCounters(events);
    expect(counters.filesRead).toBe(0);
    expect(counters.filesModified).toBe(0);
  });

  it("ignores an empty path", () => {
    expect(computeCounters([evt("file_read", { files: { path: "" } })]).filesRead).toBe(0);
  });
});

describe("computeDurationMs", () => {
  it("returns null with no events", () => {
    expect(computeDurationMs([])).toBeNull();
  });

  it("returns zero for a single event", () => {
    expect(computeDurationMs([evt("user_message")])).toBe(0);
  });

  it("spans first to last", () => {
    const events = [
      evt("user_message", { timestamp: "2026-09-03T10:00:00.000Z" }),
      evt("assistant_message", { timestamp: "2026-09-03T10:02:30.000Z" }),
    ];
    expect(computeDurationMs(events)).toBe(150_000);
  });

  it("does not depend on the events being sorted", () => {
    const events = [
      evt("assistant_message", { timestamp: "2026-09-03T10:02:30.000Z" }),
      evt("user_message", { timestamp: "2026-09-03T10:00:00.000Z" }),
    ];
    expect(computeDurationMs(events)).toBe(150_000);
  });

  it("handles timestamps with different offsets", () => {
    const events = [
      evt("user_message", { timestamp: "2026-09-03T14:00:00.000+04:00" }),
      evt("assistant_message", { timestamp: "2026-09-03T10:01:00.000Z" }),
    ];
    expect(computeDurationMs(events)).toBe(60_000);
  });
});

describe("purity", () => {
  it("does not mutate the input", () => {
    const events = [evt("tool_call", { tokens: { input: 1 } })];
    const before = structuredClone(events);
    computeCounters(events);
    computeDurationMs(events);
    expect(events).toEqual(before);
  });

  it("is deterministic", () => {
    const events = [evt("tool_call"), evt("tool_result", { result: { status: "error" } })];
    expect(computeCounters(events)).toEqual(computeCounters(events));
  });
});
