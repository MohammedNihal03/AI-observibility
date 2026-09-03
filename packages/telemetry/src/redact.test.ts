import type { NormalizedAgentEvent } from "@observatory/shared";
import { describe, expect, it } from "vitest";

import { redactDeep, redactEvent, redactString, redactionKinds } from "./redact.js";

const kindsOf = (value: string): string[] =>
  redactString(value)
    .redactions.map((hit) => hit.kind)
    .sort();

describe("redactString - credential formats", () => {
  it("redacts an Anthropic API key", () => {
    const result = redactString("ANTHROPIC_API_KEY is sk-ant-api03-AbCdEf1234567890XyZwVu");
    expect(result.value).not.toContain("sk-ant-api03");
    expect(result.value).toContain("[REDACTED:");
  });

  it("redacts an OpenAI API key", () => {
    const result = redactString("use sk-proj-abcdefghijklmnopqrstuvwxyz1234");
    expect(result.value).not.toContain("sk-proj-abcdefghij");
    expect(kindsOf("use sk-proj-abcdefghijklmnopqrstuvwxyz1234")).toContain("openai_api_key");
  });

  it("redacts a GitHub token", () => {
    expect(redactString("ghp_1234567890abcdefghijklmnop").value).not.toContain("ghp_1234567890");
  });

  it("redacts an AWS access key id", () => {
    expect(redactString("AKIAIOSFODNN7EXAMPLE").value).toBe("[REDACTED:aws_access_key_id]");
  });

  it("redacts a Google API key", () => {
    const key = `AIza${"a".repeat(35)}`;
    expect(redactString(key).value).toBe("[REDACTED:google_api_key]");
  });

  it("redacts a Slack token", () => {
    expect(redactString("xoxb-123456789012-abcdefghijkl").value).toContain(
      "[REDACTED:slack_token]",
    );
  });

  it("redacts a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p";
    expect(redactString(`Authorization: ${jwt}`).value).toContain("[REDACTED:jwt]");
  });

  it("redacts a private key block whole", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQ\nabc\n-----END RSA PRIVATE KEY-----";
    const result = redactString(`key:\n${pem}`);
    expect(result.value).toBe("key:\n[REDACTED:private_key]");
    expect(result.value).not.toContain("MIIEowIBAAKCAQ");
  });

  it("redacts a bearer token but keeps the scheme", () => {
    const result = redactString("curl -H 'Authorization: Bearer abcdefghij0123456789'");
    expect(result.value).toContain("Bearer [REDACTED:bearer_token]");
    expect(result.value).not.toContain("abcdefghij0123456789");
  });

  it("redacts credentials embedded in a URL but keeps the scheme", () => {
    const result = redactString("git clone https://user:hunter2@github.com/acme/repo.git");
    expect(result.value).toContain("https://[REDACTED:url_credentials]@github.com/acme/repo.git");
    expect(result.value).not.toContain("hunter2");
  });

  it("redacts a secret assignment but keeps the variable name", () => {
    const result = redactString("export DATABASE_PASSWORD=s3cr3t-value");
    expect(result.value).toBe("export DATABASE_PASSWORD=[REDACTED:secret_assignment]");
  });

  it("redacts a quoted secret assignment", () => {
    expect(redactString('MY_API_KEY: "abc123"').value).toBe(
      "MY_API_KEY: [REDACTED:secret_assignment]",
    );
  });

  it("redacts a long-form credential flag", () => {
    expect(redactString("mysql --password=hunter2 -u root").value).toContain(
      "--password=[REDACTED:credential_flag]",
    );
  });

  it("leaves ambiguous short flags alone", () => {
    const command = "docker run -p 8080:80 nginx";
    expect(redactString(command).value).toBe(command);
  });

  it("reports which kinds it redacted, and how many", () => {
    const result = redactString("AKIAIOSFODNN7EXAMPLE and AKIAIOSFODNN7SAMPLES");
    expect(result.redactions).toEqual([{ kind: "aws_access_key_id", count: 2 }]);
  });

  it("classifies an Anthropic key as Anthropic, not as a generic sk- key", () => {
    expect(kindsOf("sk-ant-api03-AbCdEf1234567890XyZwVu")).toEqual(["anthropic_api_key"]);
  });
});

describe("redactString - things that must not be touched", () => {
  const innocuous = [
    "npm test",
    "git commit -m 'fix auth timeout'",
    "src/auth/token.ts",
    "8148398f2a1b4c5d6e7f8091a2b3c4d5e6f70819",
    "Read 245 lines from package.json",
    "docker run -p 3000:3000 app",
    "The test failed with exit code 1",
    "npm run build -- --watch",
  ];

  it("leaves ordinary developer text unchanged", () => {
    for (const text of innocuous) {
      const result = redactString(text);
      expect(result.value, text).toBe(text);
      expect(result.redactions, text).toHaveLength(0);
    }
  });

  it("does not redact a word merely containing 'token'", () => {
    const text = "tokenizer.ts parses the input";
    expect(redactString(text).value).toBe(text);
  });
});

describe("redactDeep", () => {
  it("redacts strings nested in objects and arrays", () => {
    const result = redactDeep({
      command: "export API_KEY=abc123",
      nested: { list: ["AKIAIOSFODNN7EXAMPLE", 42, null, true] },
    });
    expect(JSON.stringify(result.value)).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(JSON.stringify(result.value)).not.toContain("abc123");
  });

  it("preserves shape and non-string values", () => {
    const input = { a: 1, b: false, c: null, d: [1, 2], e: { f: "plain" } };
    expect(redactDeep(input).value).toEqual(input);
  });

  it("aggregates counts across the whole structure", () => {
    const result = redactDeep(["AKIAIOSFODNN7EXAMPLE", { x: "AKIAIOSFODNN7SAMPLES" }]);
    expect(result.redactions).toEqual([{ kind: "aws_access_key_id", count: 2 }]);
  });

  it("does not recurse without bound", () => {
    interface Nested {
      next?: Nested;
      leaf?: string;
    }
    let node: Nested = { leaf: "AKIAIOSFODNN7EXAMPLE" };
    for (let depth = 0; depth < 40; depth += 1) node = { next: node };
    expect(() => redactDeep(node)).not.toThrow();
  });

  it("does not mutate its input", () => {
    const input = { command: "export API_KEY=abc123" };
    const copy = structuredClone(input);
    redactDeep(input);
    expect(input).toEqual(copy);
  });
});

describe("redactEvent", () => {
  const event: NormalizedAgentEvent = {
    id: "evt_1",
    sessionId: "sess_1",
    timestamp: "2026-09-03T10:00:00.000Z",
    source: "claude_code",
    type: "tool_call",
    signature: "tool_call|tool:Bash|cmd:curl -H 'Authorization: Bearer abcdefghij0123456789'",
    tool: { name: "Bash", command: "curl -H 'Authorization: Bearer abcdefghij0123456789'" },
    metadata: { env: { OPENAI_API_KEY: "sk-abcdefghijklmnopqrstuvwxyz12" } },
  };

  it("redacts the command", () => {
    const result = redactEvent(event);
    expect(result.value.tool?.command).not.toContain("abcdefghij0123456789");
  });

  it("redacts the signature too, so the stored key cannot leak through it", () => {
    expect(redactEvent(event).value.signature).not.toContain("abcdefghij0123456789");
  });

  it("redacts nested metadata", () => {
    const result = redactEvent(event);
    expect(JSON.stringify(result.value.metadata)).not.toContain("sk-abcdefghijklmnopqrst");
  });

  it("leaves structural fields untouched", () => {
    const result = redactEvent(event);
    expect(result.value.id).toBe("evt_1");
    expect(result.value.sessionId).toBe("sess_1");
    expect(result.value.timestamp).toBe("2026-09-03T10:00:00.000Z");
    expect(result.value.source).toBe("claude_code");
    expect(result.value.type).toBe("tool_call");
  });

  it("reports what it removed", () => {
    const kinds = redactEvent(event).redactions.map((hit) => hit.kind);
    expect(kinds).toContain("bearer_token");
    expect(kinds).toContain("openai_api_key");
  });

  it("leaves a clean event completely alone", () => {
    const clean: NormalizedAgentEvent = {
      ...event,
      signature: "tool_call|tool:Bash|cmd:npm test",
      tool: { name: "Bash", command: "npm test" },
      metadata: { cwd: "src" },
    };
    const result = redactEvent(clean);
    expect(result.value).toEqual(clean);
    expect(result.redactions).toHaveLength(0);
  });

  it("is idempotent - redacting twice changes nothing further", () => {
    const once = redactEvent(event).value;
    expect(redactEvent(once).value).toEqual(once);
  });
});

describe("redactionKinds", () => {
  it("lists every recognized credential kind", () => {
    const kinds = redactionKinds();
    expect(kinds).toContain("private_key");
    expect(kinds).toContain("anthropic_api_key");
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
