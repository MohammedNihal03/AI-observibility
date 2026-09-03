import { describe, expect, it, vi } from "vitest";

import { EventValidationError } from "./errors.js";
import {
  createEventProcessor,
  fixedClock,
  sequentialIds,
  type ProcessedEvent,
} from "./processor.js";

const deterministic = (
  overrides: Partial<Parameters<typeof createEventProcessor>[0]> = {},
): ReturnType<typeof createEventProcessor> =>
  createEventProcessor({
    now: fixedClock("2026-09-03T10:00:00.000Z", 1000),
    idFactory: sequentialIds(),
    ...overrides,
  });

const toolCall = (command: string) => ({
  source: "claude_code",
  type: "tool_call",
  tool: { name: "Bash", command },
});

describe("event processor", () => {
  it("ingests a valid event and assigns id, session and timestamp", () => {
    const processor = deterministic();
    const { event } = processor.ingest("sess_1", toolCall("npm test"));

    expect(event.id).toBe("evt_000001");
    expect(event.sessionId).toBe("sess_1");
    expect(event.timestamp).toBe("2026-09-03T10:00:00.000Z");
    expect(event.signature).toBe("tool_call|tool:Bash|cmd:npm test");
  });

  it("advances the injected clock and id sequence per event", () => {
    const processor = deterministic();
    processor.ingest("sess_1", toolCall("npm test"));
    const { event } = processor.ingest("sess_1", toolCall("npm run build"));

    expect(event.id).toBe("evt_000002");
    expect(event.timestamp).toBe("2026-09-03T10:00:01.000Z");
  });

  it("throws EventValidationError on an invalid payload", () => {
    const processor = deterministic();
    expect(() => processor.ingest("sess_1", { source: "claude_code" })).toThrow(
      EventValidationError,
    );
  });

  it("reports the offending field in the error", () => {
    const processor = deterministic();
    try {
      processor.ingest("sess_1", { source: "claude_code", type: "not_a_type" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(EventValidationError);
      const issues = (error as EventValidationError).issues;
      expect(issues.some((issue) => issue.path === "type")).toBe(true);
    }
  });

  it("tryIngest skips junk instead of throwing, and counts it", () => {
    const processor = deterministic();
    expect(processor.tryIngest("sess_1", { nonsense: true })).toBeUndefined();
    expect(processor.tryIngest("sess_1", "not even an object")).toBeUndefined();
    expect(processor.stats().rejected).toBe(2);
    expect(processor.stats().events).toBe(0);
  });

  it("keeps events per session, in arrival order", () => {
    const processor = deterministic();
    processor.ingest("sess_a", toolCall("npm test"));
    processor.ingest("sess_b", toolCall("npm run build"));
    processor.ingest("sess_a", toolCall("npm run lint"));

    expect(processor.getEvents("sess_a").map((event) => event.tool?.command)).toEqual([
      "npm test",
      "npm run lint",
    ]);
    expect(processor.getEvents("sess_b")).toHaveLength(1);
    expect([...processor.getSessionIds()].sort()).toEqual(["sess_a", "sess_b"]);
  });

  it("returns an empty list for an unknown session", () => {
    expect(deterministic().getEvents("nope")).toEqual([]);
  });

  it("ingestMany processes a batch in order", () => {
    const processor = deterministic();
    const results = processor.ingestMany("sess_1", [
      toolCall("npm test"),
      toolCall("npm run build"),
    ]);
    expect(results.map((result) => result.event.id)).toEqual(["evt_000001", "evt_000002"]);
  });

  it("clear() empties everything", () => {
    const processor = deterministic();
    processor.ingest("sess_1", toolCall("npm test"));
    processor.clear();
    expect(processor.stats()).toEqual({ sessions: 0, events: 0, rejected: 0, redactions: 0 });
  });
});

describe("pipeline ordering (BUILD.md section 48)", () => {
  it("redacts BEFORE handing the event to the sink", () => {
    const seen: ProcessedEvent[] = [];
    const processor = deterministic({ onEvent: (processed) => seen.push(processed) });

    processor.ingest("sess_1", {
      source: "claude_code",
      type: "tool_call",
      tool: { name: "Bash", command: "export API_KEY=sk-ant-api03-AbCdEf1234567890XyZwVu" },
    });

    expect(seen).toHaveLength(1);
    const delivered = JSON.stringify(seen[0]?.event);
    expect(delivered).not.toContain("sk-ant-api03");
    expect(delivered).toContain("[REDACTED:");
  });

  it("stores only the redacted event", () => {
    const processor = deterministic();
    processor.ingest("sess_1", {
      source: "codex",
      type: "command_started",
      tool: { name: "exec", command: "psql postgres://user:hunter2@localhost/db" },
    });

    expect(JSON.stringify(processor.getEvents("sess_1"))).not.toContain("hunter2");
  });

  it("does not call the sink for a rejected payload", () => {
    const onEvent = vi.fn();
    const processor = deterministic({ onEvent });
    processor.tryIngest("sess_1", { garbage: 1 });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("counts redactions in its stats", () => {
    const processor = deterministic();
    processor.ingest("sess_1", {
      source: "generic",
      type: "error",
      metadata: { detail: "AKIAIOSFODNN7EXAMPLE" },
    });
    expect(processor.stats().redactions).toBe(1);
  });

  it("surfaces what was redacted to the caller", () => {
    const processor = deterministic();
    const { redactions } = processor.ingest("sess_1", {
      source: "generic",
      type: "error",
      metadata: { detail: "AKIAIOSFODNN7EXAMPLE" },
    });
    expect(redactions).toEqual([{ kind: "aws_access_key_id", count: 1 }]);
  });
});

describe("determinism (BUILD.md section 57)", () => {
  const script = [
    toolCall("npm test"),
    { source: "claude_code", type: "tool_result", result: { status: "error", exitCode: 1 } },
    { source: "claude_code", type: "file_edit", files: { path: "src/auth.ts" } },
    toolCall("npm test"),
    { source: "claude_code", type: "tool_result", result: { status: "success", exitCode: 0 } },
  ];

  const run = (): readonly unknown[] => {
    const processor = deterministic();
    return processor.ingestMany("sess_1", script).map((result) => result.event);
  };

  it("produces identical output for identical input", () => {
    expect(run()).toEqual(run());
  });

  it("produces identical output across separate processor instances", () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe("normalization options flow through", () => {
  it("applies the configured working directory to paths", () => {
    const processor = deterministic({ normalize: { cwd: "C:/Users/dev/project" } });
    const { event } = processor.ingest("sess_1", {
      source: "claude_code",
      type: "file_edit",
      files: { path: "C:\\Users\\dev\\project\\src\\auth.ts" },
    });
    expect(event.files?.path).toBe("src/auth.ts");
    expect(event.signature).toBe("file_edit|path:src/auth.ts");
  });
});

describe("default id and clock", () => {
  it("generates unique ids without injection", () => {
    const processor = createEventProcessor();
    const a = processor.ingest("sess_1", toolCall("npm test")).event;
    const b = processor.ingest("sess_1", toolCall("npm test")).event;
    expect(a.id).not.toBe(b.id);
    expect(Number.isFinite(Date.parse(a.timestamp))).toBe(true);
  });
});
