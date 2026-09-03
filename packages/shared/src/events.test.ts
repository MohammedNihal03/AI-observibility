import { describe, expect, it } from "vitest";

import {
  AGENT_EVENT_TYPES,
  AGENT_SOURCES,
  agentEventInputSchema,
  agentEventSchema,
  isActionEvent,
  isFailure,
  isFileEvent,
  isOutcomeEvent,
  isSuccess,
} from "./events.js";

const validEvent = {
  id: "evt_1",
  sessionId: "sess_1",
  timestamp: "2026-09-03T10:00:00.000Z",
  source: "claude_code",
  type: "tool_call",
  tool: { name: "Bash", command: "npm test" },
} as const;

describe("event contract", () => {
  it("declares the nineteen event types from the specification", () => {
    expect(AGENT_EVENT_TYPES).toHaveLength(19);
    expect(new Set(AGENT_EVENT_TYPES).size).toBe(19);
  });

  it("declares the three agent sources", () => {
    expect([...AGENT_SOURCES]).toEqual(["claude_code", "codex", "generic"]);
  });
});

describe("agentEventSchema", () => {
  it("accepts a complete event", () => {
    expect(agentEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    const result = agentEventSchema.safeParse({ ...validEvent, type: "telepathy" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown source", () => {
    expect(agentEventSchema.safeParse({ ...validEvent, source: "cursor" }).success).toBe(false);
  });

  it("requires a session id", () => {
    const { sessionId: _sessionId, ...withoutSession } = validEvent;
    expect(agentEventSchema.safeParse(withoutSession).success).toBe(false);
  });

  it("rejects an empty session id", () => {
    expect(agentEventSchema.safeParse({ ...validEvent, sessionId: "" }).success).toBe(false);
  });

  it("requires an ISO 8601 timestamp", () => {
    expect(agentEventSchema.safeParse({ ...validEvent, timestamp: "yesterday" }).success).toBe(
      false,
    );
    expect(
      agentEventSchema.safeParse({ ...validEvent, timestamp: "2026-09-03 10:00:00" }).success,
    ).toBe(false);
  });

  it("accepts a timestamp with a UTC offset", () => {
    expect(
      agentEventSchema.safeParse({ ...validEvent, timestamp: "2026-09-03T14:00:00+04:00" }).success,
    ).toBe(true);
  });

  it("rejects negative token counts", () => {
    expect(agentEventSchema.safeParse({ ...validEvent, tokens: { input: -1 } }).success).toBe(
      false,
    );
  });

  it("rejects fractional token counts", () => {
    expect(agentEventSchema.safeParse({ ...validEvent, tokens: { output: 1.5 } }).success).toBe(
      false,
    );
  });

  it("accepts a negative exit code, because signals report as negative", () => {
    expect(agentEventSchema.safeParse({ ...validEvent, result: { exitCode: -1 } }).success).toBe(
      true,
    );
  });

  it("strips unknown top-level keys instead of rejecting them", () => {
    const result = agentEventSchema.safeParse({ ...validEvent, futureField: "from a newer agent" });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("futureField");
  });

  it("keeps arbitrary metadata for adapter-specific extras", () => {
    const result = agentEventSchema.safeParse({
      ...validEvent,
      metadata: { claudeUuid: "abc", nested: { depth: 2 } },
    });
    expect(result.success).toBe(true);
    expect(result.data?.metadata).toEqual({ claudeUuid: "abc", nested: { depth: 2 } });
  });
});

describe("agentEventInputSchema", () => {
  it("allows id, sessionId and timestamp to be absent", () => {
    const result = agentEventInputSchema.safeParse({ source: "generic", type: "user_message" });
    expect(result.success).toBe(true);
  });

  it("still requires source and type", () => {
    expect(agentEventInputSchema.safeParse({ type: "user_message" }).success).toBe(false);
    expect(agentEventInputSchema.safeParse({ source: "generic" }).success).toBe(false);
  });
});

describe("event classification", () => {
  it("identifies action events", () => {
    expect(isActionEvent({ type: "tool_call" })).toBe(true);
    expect(isActionEvent({ type: "command_started" })).toBe(true);
    expect(isActionEvent({ type: "tool_result" })).toBe(false);
  });

  it("identifies outcome events", () => {
    expect(isOutcomeEvent({ type: "test_finished" })).toBe(true);
    expect(isOutcomeEvent({ type: "test_started" })).toBe(false);
  });

  it("identifies file events", () => {
    expect(isFileEvent({ type: "file_edit" })).toBe(true);
    expect(isFileEvent({ type: "search" })).toBe(false);
  });
});

describe("isFailure / isSuccess", () => {
  it("treats an error event as a failure", () => {
    expect(isFailure({ type: "error" })).toBe(true);
  });

  it("treats an error status as a failure", () => {
    expect(isFailure({ type: "tool_result", result: { status: "error" } })).toBe(true);
  });

  it("treats a non-zero exit code as a failure", () => {
    expect(isFailure({ type: "command_finished", result: { exitCode: 1 } })).toBe(true);
  });

  it("treats exit code zero as success", () => {
    expect(isSuccess({ type: "command_finished", result: { exitCode: 0 } })).toBe(true);
    expect(isFailure({ type: "command_finished", result: { exitCode: 0 } })).toBe(false);
  });

  it("does not treat a missing status as either failure or success", () => {
    expect(isFailure({ type: "tool_result" })).toBe(false);
    expect(isSuccess({ type: "tool_result" })).toBe(false);
  });

  it("does not treat an unknown status as either failure or success", () => {
    const event = { type: "tool_result", result: { status: "unknown" } } as const;
    expect(isFailure(event)).toBe(false);
    expect(isSuccess(event)).toBe(false);
  });

  it("lets an explicit error status win over a zero exit code", () => {
    const event = { type: "tool_result", result: { status: "error", exitCode: 0 } } as const;
    expect(isFailure(event)).toBe(true);
    expect(isSuccess(event)).toBe(false);
  });
});
