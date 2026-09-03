import type { AgentEventType, NormalizedAgentEvent } from "@observatory/shared";

/**
 * Deterministic event builders for tests (BUILD.md section 57).
 *
 * Not exported from the package index - this is test scaffolding, and shipping
 * it would invite fixtures into production code.
 */

export interface BuildOptions {
  readonly startedAt?: string;
  readonly stepMs?: number;
}

export class SessionBuilder {
  private readonly events: NormalizedAgentEvent[] = [];
  private index = 0;
  private readonly start: number;
  private readonly stepMs: number;

  constructor(options: BuildOptions = {}) {
    this.start = Date.parse(options.startedAt ?? "2026-09-03T10:00:00.000Z");
    this.stepMs = options.stepMs ?? 1_000;
  }

  private push(
    type: AgentEventType,
    signature: string,
    extra: Partial<NormalizedAgentEvent> = {},
  ): this {
    this.index += 1;
    this.events.push({
      id: `e${String(this.index).padStart(3, "0")}`,
      sessionId: "sess_test",
      timestamp: new Date(this.start + this.index * this.stepMs).toISOString(),
      source: "claude_code",
      type,
      signature,
      ...extra,
    });
    return this;
  }

  message(): this {
    return this.push("user_message", "user_message");
  }

  tokens(input: number, output: number, cached = 0): this {
    return this.push("model_response", "model_response", {
      tokens: { input, output, cached },
    });
  }

  /** A command invocation. Pair with `.ok()` or `.fail()`. */
  run(command: string): this {
    return this.push("tool_call", `tool_call|tool:Bash|cmd:${command}`, {
      tool: { name: "Bash", command },
    });
  }

  read(path: string): this {
    return this.push("file_read", `file_read|tool:Read|path:${path}`, {
      tool: { name: "Read" },
      files: { path },
    });
  }

  /** A modification - the "correction" half of a correction loop. */
  edit(path: string): this {
    return this.push("file_edit", `file_edit|tool:Edit|path:${path}`, {
      tool: { name: "Edit" },
      files: { path },
    });
  }

  ok(): this {
    return this.push("tool_result", "tool_result", {
      result: { status: "success", exitCode: 0, confidence: "reported" },
    });
  }

  fail(): this {
    return this.push("tool_result", "tool_result", {
      result: { status: "error", exitCode: 1, confidence: "reported" },
    });
  }

  /** A result with no reported status, which must stay distinct from a failure. */
  unknown(): this {
    return this.push("tool_result", "tool_result", {});
  }

  build(): readonly NormalizedAgentEvent[] {
    return [...this.events];
  }
}

export function session(options?: BuildOptions): SessionBuilder {
  return new SessionBuilder(options);
}

/** Section 16's healthy pattern: fail, inspect, change something, retry, pass. */
export function healthyRecovery(): readonly NormalizedAgentEvent[] {
  return session()
    .message()
    .read("src/auth.ts")
    .edit("src/auth.ts")
    .run("npm test")
    .fail()
    .read("src/auth.ts")
    .edit("src/auth.ts")
    .run("npm test")
    .ok()
    .build();
}

/** Section 16's degrading pattern: the same command three times, nothing changed. */
export function blindRepetition(): readonly NormalizedAgentEvent[] {
  return session()
    .message()
    .run("npm test")
    .fail()
    .run("npm test")
    .fail()
    .run("npm test")
    .fail()
    .build();
}
