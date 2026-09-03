import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentEventInput, SessionSnapshot } from "@observatory/shared";
import { beforeAll, describe, expect, it } from "vitest";

import type { ApiClient } from "./api.js";
import { importClaudeCodeSession, listSessions, NoTranscriptError } from "./import.js";

/**
 * `observatory import` (BUILD.md Phase 11).
 *
 * Runs against a fake home directory holding a transcript in the real format,
 * and a recording API client. No network, no developer's actual sessions.
 */

let home: string;
let transcriptPath: string;

const LINE = (object: unknown): string => JSON.stringify(object);

const TRANSCRIPT = [
  LINE({
    type: "user",
    timestamp: "2026-09-03T10:00:00.000Z",
    sessionId: "abc123",
    cwd: "/repo",
    message: { role: "user", content: "Fix the flaky billing test" },
  }),
  LINE({
    type: "assistant",
    timestamp: "2026-09-03T10:00:02.000Z",
    sessionId: "abc123",
    cwd: "/repo",
    message: {
      id: "m1",
      model: "claude-opus-5",
      usage: { input_tokens: 10, cache_read_input_tokens: 1000, output_tokens: 100 },
      content: [
        { type: "tool_use", id: "c1", name: "Read", input: { file_path: "/repo/billing.ts" } },
      ],
    },
  }),
  LINE({
    type: "user",
    timestamp: "2026-09-03T10:00:03.000Z",
    sessionId: "abc123",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "c1", content: "..." }],
    },
  }),
] as const;

/** Records what the CLI sent, and pretends the session is not yet known. */
function fakeClient(options: { existing?: number } = {}): ApiClient & {
  created: Record<string, unknown>[];
  sent: AgentEventInput[];
} {
  const created: Record<string, unknown>[] = [];
  const sent: AgentEventInput[] = [];

  return {
    server: "http://test",
    created,
    sent,
    health: () =>
      Promise.resolve({
        status: "ok",
        version: "0.0.0",
        contractVersion: 1,
        uptimeSeconds: 1,
        subscribers: 0,
        database: { location: "memory", sessions: 0 },
      }),
    createSession: (input) => {
      created.push(input);
      return Promise.resolve({
        id: String(input["id"]),
        source: "claude_code",
        model: null,
        goal: null,
        goalKeywords: null,
        startedAt: "2026-09-03T10:00:00.000Z",
        endedAt: null,
        status: "active",
        createdAt: "2026-09-03T10:00:00.000Z",
      });
    },
    getSession: (id) =>
      options.existing === undefined
        ? Promise.reject(new Error("not_found"))
        : Promise.resolve({
            session: { id, eventCount: options.existing },
          } as unknown as SessionSnapshot),
    sendEvent: (_id, event) => {
      sent.push(event);
      return Promise.resolve({ accepted: 1 });
    },
    sendEvents: (_id, events) => {
      sent.push(...events);
      return Promise.resolve({ accepted: events.length, redactions: 0 });
    },
    listSessions: () => Promise.resolve({ sessions: [] }),
    endSession: () => Promise.reject(new Error("not used")),
    compareSessions: () => Promise.reject(new Error("not used")),
    compareGroups: () => Promise.reject(new Error("not used")),
  };
}

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "observatory-import-"));
  const project = join(home, ".claude", "projects", "c--repo");
  await mkdir(project, { recursive: true });
  transcriptPath = join(project, "abc123.jsonl");
  await writeFile(transcriptPath, `${TRANSCRIPT.join("\n")}\n`, "utf8");
});

describe("listSessions", () => {
  it("finds transcripts under the home directory", async () => {
    const found = await listSessions({ home });
    expect(found).toHaveLength(1);
    expect(found[0]?.sessionId).toBe("abc123");
    expect(found[0]?.project).toBe("c--repo");
  });

  it("filters by project", async () => {
    expect(await listSessions({ home, project: "nothing-like-this" })).toHaveLength(0);
  });
});

describe("importClaudeCodeSession", () => {
  it("creates the session from the transcript and sends its events", async () => {
    const client = fakeClient();
    const result = await importClaudeCodeSession({ home, client });

    expect(result.sessionId).toBe("cc_abc123");
    expect(client.created).toHaveLength(1);
    expect(client.created[0]?.["model"]).toBe("claude-opus-5");
    expect(client.created[0]?.["goal"]).toBe("Fix the flaky billing test");
    expect(client.created[0]?.["source"]).toBe("claude_code");

    // The prompt, the model turn, the read it performed, and its result.
    expect(result.sent).toBe(4);
    expect(client.sent.map((event) => event.type)).toEqual([
      "user_message",
      "model_response",
      "file_read",
      "tool_result",
    ]);
  });

  it("prefixes the id so agent sessions cannot collide with demo ones", async () => {
    const client = fakeClient();
    const result = await importClaudeCodeSession({ home, client });
    expect(result.sessionId.startsWith("cc_")).toBe(true);
  });

  it("appends only what the server does not already have", async () => {
    const client = fakeClient({ existing: 3 });
    const result = await importClaudeCodeSession({ home, client });

    expect(client.created).toHaveLength(0);
    expect(result.alreadyStored).toBe(3);
    expect(client.sent).toHaveLength(1);
  });

  it("sends nothing twice when re-run against a complete session", async () => {
    const client = fakeClient({ existing: 4 });
    const result = await importClaudeCodeSession({ home, client });
    expect(result.sent).toBe(0);
    expect(client.sent).toEqual([]);
  });

  it("says so plainly when there is nothing to import", async () => {
    await expect(
      importClaudeCodeSession({
        home: join(tmpdir(), "no-claude-code-here"),
        client: fakeClient(),
      }),
    ).rejects.toBeInstanceOf(NoTranscriptError);
  });

  it("accepts an explicit transcript path", async () => {
    const client = fakeClient();
    const result = await importClaudeCodeSession({ file: transcriptPath, client });
    expect(result.file).toBe(transcriptPath);
    expect(result.sent).toBeGreaterThan(0);
  });

  it("never carries file contents or command output off the machine", async () => {
    const client = fakeClient();
    await importClaudeCodeSession({ home, client });
    expect(JSON.stringify(client.sent)).not.toContain("...");
  });
});
