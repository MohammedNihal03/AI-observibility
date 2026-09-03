import type { AgentEventInput } from "@observatory/shared";
import { describe, expect, it } from "vitest";

import {
  eventSignature,
  normalizeCommand,
  normalizeEvent,
  normalizePath,
  normalizeWhitespace,
} from "./normalize.js";

const CWD = "C:/Users/dev/project";
const HOME = "C:/Users/dev";

describe("normalizeWhitespace", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalizeWhitespace("  npm    test \n")).toBe("npm test");
  });

  it("collapses tabs and newlines inside a command", () => {
    expect(normalizeWhitespace("npm\trun\n\ttest")).toBe("npm run test");
  });
});

describe("normalizePath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizePath("src\\auth\\token.ts")).toBe("src/auth/token.ts");
  });

  it("collapses duplicate separators", () => {
    expect(normalizePath("src//auth///token.ts")).toBe("src/auth/token.ts");
  });

  it("lowercases the drive letter so C: and c: agree", () => {
    expect(normalizePath("C:\\Temp\\a.ts")).toBe(normalizePath("c:/Temp/a.ts"));
  });

  it("makes a path under the working directory relative", () => {
    expect(normalizePath("C:/Users/dev/project/src/auth.ts", { cwd: CWD })).toBe("src/auth.ts");
  });

  it("matches the working directory case-insensitively on Windows-style paths", () => {
    expect(normalizePath("c:/users/dev/project/src/auth.ts", { cwd: CWD })).toBe("src/auth.ts");
  });

  it("collapses a path under the home directory to ~", () => {
    expect(normalizePath("C:/Users/dev/notes.md", { homeDir: HOME })).toBe("~/notes.md");
  });

  it("prefers the working directory over the home directory", () => {
    expect(normalizePath("C:/Users/dev/project/a.ts", { cwd: CWD, homeDir: HOME })).toBe("a.ts");
  });

  it("leaves an unrelated absolute path intact rather than replacing it", () => {
    expect(normalizePath("D:/other/repo/a.ts", { cwd: CWD })).toBe("d:/other/repo/a.ts");
  });

  it("strips a file:// prefix", () => {
    expect(normalizePath("file:///c:/tmp/a.ts")).toBe("c:/tmp/a.ts");
  });

  it("reduces the working directory itself to a dot", () => {
    expect(normalizePath("C:/Users/dev/project", { cwd: CWD })).toBe(".");
  });

  it("is idempotent", () => {
    const once = normalizePath("C:\\Users\\dev\\project\\src\\a.ts", { cwd: CWD });
    expect(normalizePath(once, { cwd: CWD })).toBe(once);
  });
});

describe("normalizeCommand", () => {
  it("collapses whitespace", () => {
    expect(normalizeCommand("  npm    test  ")).toBe("npm test");
  });

  it("removes a trailing semicolon", () => {
    expect(normalizeCommand("npm test;")).toBe("npm test");
  });

  it("makes absolute paths relative to the working directory", () => {
    expect(normalizeCommand("cat C:/Users/dev/project/src/a.ts", { cwd: CWD })).toBe(
      "cat src/a.ts",
    );
  });

  it("matches the working directory whichever separator the agent used", () => {
    expect(normalizeCommand("cat C:\\Users\\dev\\project\\src\\a.ts", { cwd: CWD })).toBe(
      "cat src/a.ts",
    );
  });

  it("collapses the home directory to ~", () => {
    expect(normalizeCommand("cat C:/Users/dev/.npmrc", { homeDir: HOME })).toBe("cat ~/.npmrc");
  });

  it("drops cosmetic flags", () => {
    expect(normalizeCommand("npm test --color")).toBe("npm test");
    expect(normalizeCommand("npm test --color=always")).toBe("npm test");
  });

  it("keeps flags that change behaviour", () => {
    expect(normalizeCommand("docker run -p 8080:80 img")).toBe("docker run -p 8080:80 img");
    expect(normalizeCommand("npm test -- --watch")).toBe("npm test -- --watch");
  });

  it("respects a custom insignificant-flag list", () => {
    expect(normalizeCommand("npm test --silent", { insignificantFlags: ["--silent"] })).toBe(
      "npm test",
    );
  });

  it("does not lowercase, because commands are case-sensitive", () => {
    expect(normalizeCommand("Get-ChildItem")).toBe("Get-ChildItem");
  });

  // Regression: a cwd written with backslashes - i.e. every real Windows
  // session - used to build an invalid regex and throw.
  it("accepts a working directory written with backslashes", () => {
    const backslashCwd = "C:\\Users\\dev\\project";
    expect(() => normalizeCommand("npm test", { cwd: backslashCwd })).not.toThrow();
    expect(normalizeCommand("cat C:\\Users\\dev\\project\\src\\a.ts", { cwd: backslashCwd })).toBe(
      "cat src/a.ts",
    );
  });

  it("accepts a home directory written with backslashes", () => {
    expect(normalizeCommand("cat C:\\Users\\dev\\.npmrc", { homeDir: "C:\\Users\\dev" })).toBe(
      "cat ~/.npmrc",
    );
  });

  it("treats both separator spellings of the working directory alike", () => {
    const withBackslashes = normalizeCommand("cat C:/Users/dev/project/a.ts", {
      cwd: "C:\\Users\\dev\\project",
    });
    const withSlashes = normalizeCommand("cat C:/Users/dev/project/a.ts", {
      cwd: "C:/Users/dev/project",
    });
    expect(withBackslashes).toBe(withSlashes);
  });

  it("does not break on a path containing regex metacharacters", () => {
    const cwd = "C:\\Users\\dev\\my (project) [v2]";
    expect(() => normalizeCommand("npm test", { cwd })).not.toThrow();
    expect(normalizeCommand("cat C:\\Users\\dev\\my (project) [v2]\\a.ts", { cwd })).toBe(
      "cat a.ts",
    );
  });

  it("makes two spellings of the same invocation identical", () => {
    const a = normalizeCommand("npm   test --color ", { cwd: CWD });
    const b = normalizeCommand("npm test;", { cwd: CWD });
    expect(a).toBe(b);
  });
});

describe("eventSignature", () => {
  const base = { type: "tool_call" } as const;

  it("is stable across cosmetic differences in the command", () => {
    const a = eventSignature({ ...base, tool: { name: "Bash", command: "npm   test" } });
    const b = eventSignature({ ...base, tool: { name: "Bash", command: "npm test " } });
    expect(a).toBe(b);
  });

  it("distinguishes different commands", () => {
    const a = eventSignature({ ...base, tool: { name: "Bash", command: "npm test" } });
    const b = eventSignature({ ...base, tool: { name: "Bash", command: "npm run build" } });
    expect(a).not.toBe(b);
  });

  it("distinguishes the same command run through different tools", () => {
    const a = eventSignature({ ...base, tool: { name: "Bash", command: "npm test" } });
    const b = eventSignature({ ...base, tool: { name: "PowerShell", command: "npm test" } });
    expect(a).not.toBe(b);
  });

  it("uses the file path when there is no command", () => {
    const signature = eventSignature(
      {
        type: "file_edit",
        tool: { name: "Edit" },
        files: { path: "C:/Users/dev/project/src/auth.ts" },
      },
      { cwd: CWD },
    );
    expect(signature).toBe("file_edit|tool:Edit|path:src/auth.ts");
  });

  it("distinguishes edits to different files", () => {
    const a = eventSignature({ type: "file_edit", files: { path: "src/a.ts" } });
    const b = eventSignature({ type: "file_edit", files: { path: "src/b.ts" } });
    expect(a).not.toBe(b);
  });

  it("ignores the result, so repeated failures share one signature", () => {
    const action = {
      type: "command_finished",
      tool: { name: "Bash", command: "npm test" },
    } as const;
    const failed = eventSignature({ ...action });
    const passed = eventSignature({ ...action });
    expect(failed).toBe(passed);
  });

  it("separates an action from its outcome", () => {
    const started = eventSignature({
      type: "command_started",
      tool: { name: "Bash", command: "npm test" },
    });
    const finished = eventSignature({
      type: "command_finished",
      tool: { name: "Bash", command: "npm test" },
    });
    expect(started).not.toBe(finished);
  });

  it("falls back to the event type alone", () => {
    expect(eventSignature({ type: "user_message" })).toBe("user_message");
  });

  it("treats a blank command as absent", () => {
    expect(eventSignature({ type: "tool_call", tool: { name: "Read", command: "   " } })).toBe(
      "tool_call|tool:Read",
    );
  });
});

describe("normalizeEvent", () => {
  const context = {
    sessionId: "sess_ctx",
    id: "evt_ctx",
    timestamp: "2026-09-03T10:00:00.000Z",
    options: { cwd: CWD },
  };

  const input: AgentEventInput = {
    source: "claude_code",
    type: "tool_call",
    tool: { name: "Bash", command: "  npm    test  " },
  };

  it("fills id, sessionId and timestamp from the context", () => {
    const event = normalizeEvent(input, context);
    expect(event.id).toBe("evt_ctx");
    expect(event.sessionId).toBe("sess_ctx");
    expect(event.timestamp).toBe("2026-09-03T10:00:00.000Z");
  });

  it("lets values supplied by the collector win over the context", () => {
    const event = normalizeEvent(
      { ...input, id: "real_id", sessionId: "real_sess", timestamp: "2026-01-01T00:00:00.000Z" },
      context,
    );
    expect(event.id).toBe("real_id");
    expect(event.sessionId).toBe("real_sess");
    expect(event.timestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  it("attaches a signature", () => {
    expect(normalizeEvent(input, context).signature).toBe("tool_call|tool:Bash|cmd:npm test");
  });

  it("tidies the stored command without destroying it", () => {
    expect(normalizeEvent(input, context).tool?.command).toBe("npm test");
  });

  it("normalizes the file path", () => {
    const event = normalizeEvent(
      { source: "codex", type: "file_read", files: { path: "C:\\Users\\dev\\project\\src\\a.ts" } },
      context,
    );
    expect(event.files?.path).toBe("src/a.ts");
  });

  it("is deterministic", () => {
    expect(normalizeEvent(input, context)).toEqual(normalizeEvent(input, context));
  });

  it("does not mutate its input", () => {
    const original = structuredClone(input);
    normalizeEvent(input, context);
    expect(input).toEqual(original);
  });
});
