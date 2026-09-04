import { agentEventInputSchema } from "@observatory/shared";
import { describe, expect, it } from "vitest";

import { findTranscripts, parseTranscript } from "./claude-code.js";

/**
 * The Claude Code adapter (BUILD.md Phase 11).
 *
 * The fixtures below are the real transcript shape, verified against Claude
 * Code 2.1.x on a live session: the same line types, the same nesting, the same
 * duplicated `usage` object across the assistant lines of one API response.
 * They are written out in full rather than generated, because the point of this
 * suite is to pin the MAPPING - if the format changes, these should fail.
 */

const TS = (seconds: number): string =>
  new Date(Date.parse("2026-09-03T10:00:00.000Z") + seconds * 1000).toISOString();

interface LineOptions {
  readonly sidechain?: boolean;
}

function assistant(
  id: string,
  content: unknown[],
  usage: Record<string, number> | null,
  seconds: number,
  options: LineOptions = {},
): string {
  return JSON.stringify({
    type: "assistant",
    uuid: `u-${id}-${seconds}`,
    timestamp: TS(seconds),
    sessionId: "sess-real",
    cwd: "/repo",
    gitBranch: "main",
    version: "2.1.251",
    isSidechain: options.sidechain === true,
    message: {
      id,
      model: "claude-opus-5",
      content,
      ...(usage === null ? {} : { usage }),
    },
  });
}

function user(content: unknown, seconds: number, options: LineOptions = {}): string {
  return JSON.stringify({
    type: "user",
    uuid: `uu-${seconds}`,
    timestamp: TS(seconds),
    sessionId: "sess-real",
    cwd: "/repo",
    isSidechain: options.sidechain === true,
    message: { role: "user", content },
  });
}

const USAGE = {
  input_tokens: 12,
  cache_creation_input_tokens: 400,
  cache_read_input_tokens: 30_000,
  output_tokens: 250,
};

/** A short session: a prompt, a read, a failing test, a fix, a passing test. */
const TRANSCRIPT: readonly string[] = [
  user("Fix the failing auth tests", 0),
  // One API response, written as three lines that all repeat the same usage.
  assistant("msg_1", [{ type: "thinking", thinking: "..." }], USAGE, 2),
  assistant(
    "msg_1",
    [{ type: "tool_use", id: "call_a", name: "Read", input: { file_path: "/repo/src/auth.ts" } }],
    USAGE,
    3,
  ),
  assistant("msg_1", [{ type: "text", text: "Looking" }], USAGE, 3),
  user([{ type: "tool_result", tool_use_id: "call_a", content: "file contents here" }], 4),
  assistant(
    "msg_2",
    [
      {
        type: "tool_use",
        id: "call_b",
        name: "Bash",
        input: { command: "npm test", description: "run tests" },
      },
    ],
    { ...USAGE, cache_read_input_tokens: 31_000 },
    5,
  ),
  user([{ type: "tool_result", tool_use_id: "call_b", content: "1 failed", is_error: true }], 9),
  assistant(
    "msg_3",
    [
      {
        type: "tool_use",
        id: "call_c",
        name: "Edit",
        input: { file_path: "/repo/src/auth.ts", old_string: "a", new_string: "b" },
      },
    ],
    { ...USAGE, cache_read_input_tokens: 32_000 },
    10,
  ),
  user([{ type: "tool_result", tool_use_id: "call_c", content: "ok" }], 11),
  assistant(
    "msg_4",
    [{ type: "tool_use", id: "call_d", name: "Bash", input: { command: "npm test" } }],
    { ...USAGE, cache_read_input_tokens: 33_000 },
    12,
  ),
  user([{ type: "tool_result", tool_use_id: "call_d", content: "passed" }], 16),
  // Bookkeeping lines the adapter must ignore without complaint.
  JSON.stringify({ type: "ai-title", sessionId: "sess-real", aiTitle: "Fix auth" }),
  JSON.stringify({ type: "file-history-snapshot", messageId: "msg_3", snapshot: {} }),
  JSON.stringify({ type: "atis-latch", sessionId: "sess-real", atis: {} }),
];

describe("parseTranscript", () => {
  const result = parseTranscript(TRANSCRIPT);

  it("emits only events the ingestion pipeline accepts", () => {
    for (const event of result.events) {
      expect(() => agentEventInputSchema.parse(event)).not.toThrow();
    }
    expect(result.events.length).toBeGreaterThan(0);
  });

  it("reads the session's identity out of the lines", () => {
    expect(result.session.sessionId).toBe("sess-real");
    expect(result.session.model).toBe("claude-opus-5");
    expect(result.session.cwd).toBe("/repo");
    expect(result.session.gitBranch).toBe("main");
    expect(result.session.version).toBe("2.1.251");
    expect(result.session.startedAt).toBe(TS(0));
    expect(result.session.endedAt).toBe(TS(16));
  });

  it("takes the goal from the user's first message (section 28)", () => {
    expect(result.session.goal).toBe("Fix the failing auth tests");
  });

  it("counts each API response's tokens exactly once", () => {
    const responses = result.events.filter((event) => event.type === "model_response");
    // Four distinct message ids across six assistant lines.
    expect(responses).toHaveLength(4);
    expect(result.duplicateUsage).toBe(2);

    const cached = responses.map((event) => event.tokens?.cached);
    expect(cached).toEqual([30_400, 31_400, 32_400, 33_400]);
  });

  it("maps tools onto semantic event types, not bare tool calls", () => {
    const types = result.events
      .filter((event) => event.tool !== undefined)
      .map((event) => `${event.tool?.name}:${event.type}`);

    expect(types).toEqual(["Read:file_read", "Bash:tool_call", "Edit:file_edit", "Bash:tool_call"]);
  });

  it("carries the path and the command, and never their contents", () => {
    const read = result.events.find((event) => event.type === "file_read");
    // Relative to the session's cwd, so the signature is portable.
    expect(read?.files?.path).toBe("src/auth.ts");

    const bash = result.events.find((event) => event.tool?.command !== undefined);
    expect(bash?.tool?.command).toBe("npm test");

    // The transcript held file contents and command output. None of it left.
    const serialized = JSON.stringify(result.events);
    expect(serialized).not.toContain("file contents here");
    expect(serialized).not.toContain("1 failed");
    expect(serialized).not.toContain("old_string");
  });

  it("bounds a command so a heredoc cannot smuggle a file into telemetry", () => {
    const payload = `cat > secrets.txt <<'EOF'\n${"SECRET-LINE\n".repeat(200)}EOF`;
    const parsed = parseTranscript([
      assistant(
        "msg_h",
        [{ type: "tool_use", id: "h1", name: "Bash", input: { command: payload } }],
        null,
        1,
      ),
    ]);

    const command =
      parsed.events.find((event) => event.tool?.command !== undefined)?.tool?.command ?? "";
    expect(command.length).toBeLessThan(600);
    expect(command).toContain("truncated");
    expect(command).toContain(String(payload.length));
    // Only the head survives; the bulk of the heredoc does not travel.
    expect((command.match(/SECRET-LINE/gu) ?? []).length).toBeLessThan(50);
  });

  it("keeps two different long commands distinguishable after truncation", () => {
    const prefix = "x".repeat(600);
    const parsed = parseTranscript([
      assistant(
        "msg_t",
        [
          { type: "tool_use", id: "t1", name: "Bash", input: { command: `${prefix}A` } },
          { type: "tool_use", id: "t2", name: "Bash", input: { command: `${prefix}BB` } },
        ],
        null,
        1,
      ),
    ]);

    const [first, second] = parsed.events
      .filter((event) => event.tool?.command !== undefined)
      .map((event) => event.tool?.command);
    expect(first).toBeDefined();
    expect(first).not.toBe(second);
  });

  it("strips harness-injected context out of the goal", () => {
    const parsed = parseTranscript([
      user(
        "<ide_selection>The user selected lines 20 to 20 from AddInvoicePopup.js</ide_selection>" +
          "Fix the invoice total rounding",
        0,
      ),
    ]);
    expect(parsed.session.goal).toBe("Fix the invoice total rounding");
  });

  it("falls through to the next message when one is only injected context", () => {
    const parsed = parseTranscript([
      user("<system-reminder>background note</system-reminder>", 0),
      user("Actually fix the auth refresh", 1),
    ]);
    expect(parsed.session.goal).toBe("Actually fix the auth refresh");
  });

  it("reports failure from is_error, as a fact rather than an inference", () => {
    const results = result.events.filter((event) => event.type === "tool_result");
    expect(results).toHaveLength(4);

    const failed = results.filter((event) => event.result?.status === "error");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.result?.confidence).toBe("reported");
    expect(results.every((event) => event.result?.confidence === "reported")).toBe(true);
  });

  it("pairs actions with results by the agent's own call id", () => {
    const calls = result.events
      .filter((event) => event.tool !== undefined)
      .map((event) => event.metadata?.["callId"]);
    const outcomes = result.events
      .filter((event) => event.type === "tool_result")
      .map((event) => event.metadata?.["callId"]);

    expect(calls).toEqual(["call_a", "call_b", "call_c", "call_d"]);
    expect(outcomes).toEqual(["call_a", "call_b", "call_c", "call_d"]);
  });

  it("keeps events in the order they happened", () => {
    const times = result.events.map((event) => Date.parse(event.timestamp ?? ""));
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it("skips bookkeeping lines without treating them as failures", () => {
    expect(result.skipped).toBeGreaterThanOrEqual(3);
    expect(result.malformed).toBe(0);
  });

  it("survives a line the format grew since this was written", () => {
    const withJunk = parseTranscript([
      ...TRANSCRIPT,
      "{not json at all",
      JSON.stringify({ type: "something-new-in-2027", payload: { nested: true } }),
    ]);
    expect(withJunk.malformed).toBe(1);
    expect(withJunk.events).toEqual(result.events);
  });

  it("leaves sub-agent work out of the parent session", () => {
    const withSidechain = parseTranscript([
      ...TRANSCRIPT,
      assistant(
        "msg_side",
        [{ type: "tool_use", id: "call_x", name: "Bash", input: { command: "rg pattern" } }],
        USAGE,
        20,
        { sidechain: true },
      ),
    ]);
    expect(withSidechain.events).toHaveLength(result.events.length);

    const included = parseTranscript(
      [
        ...TRANSCRIPT,
        assistant(
          "msg_side",
          [{ type: "tool_use", id: "call_x", name: "Bash", input: { command: "rg pattern" } }],
          USAGE,
          20,
          { sidechain: true },
        ),
      ],
      { includeSidechains: true },
    );
    expect(included.events.length).toBeGreaterThan(result.events.length);
  });

  it("gives searches something to tell them apart", () => {
    const parsed = parseTranscript([
      assistant(
        "msg_g",
        [
          { type: "tool_use", id: "g1", name: "Grep", input: { pattern: "createStore" } },
          { type: "tool_use", id: "g2", name: "Grep", input: { pattern: "createHub" } },
        ],
        null,
        1,
      ),
    ]);

    const searches = parsed.events.filter((event) => event.type === "search");
    // Without a target both would share one signature and read as repetition.
    expect(searches.map((event) => event.tool?.target)).toEqual(["createStore", "createHub"]);
  });

  it("returns an empty result for an empty transcript", () => {
    const empty = parseTranscript([]);
    expect(empty.events).toEqual([]);
    expect(empty.session.sessionId).toBeNull();
  });

  /* ------------------------------------------------------------------------ */
  /* What Claude Code reports beyond the actions themselves                   */
  /* ------------------------------------------------------------------------ */

  const title = (aiTitle: string, seconds: number): string =>
    JSON.stringify({ type: "ai-title", aiTitle, timestamp: TS(seconds), sessionId: "sess-real" });

  it("keeps the last title, because Claude refines it as the session goes", () => {
    const parsed = parseTranscript([
      title("Phase 6", 1),
      user("go with phase 6", 2),
      title("Phase 6 demo generator", 30),
    ]);

    expect(parsed.session.title).toBe("Phase 6 demo generator");
    expect(parsed.events[0]?.type).toBe("session_started");
    expect(parsed.events[0]?.metadata?.["title"]).toBe("Phase 6 demo generator");
  });

  it("omits the title entirely when Claude never named the session", () => {
    const parsed = parseTranscript([user("do a thing", 0)]);
    expect(parsed.session.title).toBeNull();
    expect(parsed.events[0]?.metadata?.["title"]).toBeUndefined();
  });

  it("counts edited lines from the patch without carrying the code", () => {
    const parsed = parseTranscript([
      assistant(
        "msg_p",
        [{ type: "tool_use", id: "p1", name: "Edit", input: { file_path: "/repo/src/a.ts" } }],
        null,
        1,
      ),
      JSON.stringify({
        type: "user",
        uuid: "uu-patch",
        timestamp: TS(2),
        sessionId: "sess-real",
        cwd: "/repo",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "p1" }] },
        toolUseResult: {
          structuredPatch: [
            { lines: ["+const a = SECRET_VALUE;", "+const b = 2;", "-const old = 1;"] },
          ],
        },
      }),
    ]);

    const result = parsed.events.find((event) => event.type === "tool_result");
    expect(result?.metadata?.["linesAdded"]).toBe(2);
    expect(result?.metadata?.["linesRemoved"]).toBe(1);
    // The count travels; the content does not.
    expect(JSON.stringify(parsed.events)).not.toContain("SECRET_VALUE");
  });

  it("treats a timed-out command as a failure, though the transcript does not", () => {
    const parsed = parseTranscript([
      assistant(
        "msg_t",
        [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "npm test" } }],
        null,
        1,
      ),
      JSON.stringify({
        type: "user",
        uuid: "uu-timeout",
        timestamp: TS(122),
        sessionId: "sess-real",
        cwd: "/repo",
        // Claude Code marks a timeout `is_error: false`. Counting it as a
        // success would inflate both success rate and tool efficiency.
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "t1", is_error: false }],
        },
        toolUseResult: { timedOutAfterMs: 120_000 },
      }),
    ]);

    const result = parsed.events.find((event) => event.type === "tool_result");
    expect(result?.result?.status).toBe("error");
    expect(result?.metadata?.["timedOut"]).toBe(true);
    expect(result?.metadata?.["timedOutAfterMs"]).toBe(120_000);
  });

  it("reports thinking and cache tokens without double-counting them", () => {
    const parsed = parseTranscript([
      assistant("msg_u", [{ type: "text", text: "hi" }], { ...USAGE, output_tokens: 250 }, 1),
    ]);

    const response = parsed.events.find((event) => event.type === "model_response");
    expect(response?.tokens?.output).toBe(250);
    expect(response?.metadata?.["cacheRead"]).toBe(30_000);
    expect(response?.metadata?.["cacheCreation"]).toBe(400);
  });
});

describe("findTranscripts", () => {
  it("reports no sessions rather than failing when nothing is installed", async () => {
    const found = await findTranscripts({ home: "/nonexistent-home-for-tests" });
    expect(found).toEqual([]);
  });
});
