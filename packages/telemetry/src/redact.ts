import type { NormalizedAgentEvent } from "@observatory/shared";

/**
 * Step 3 of the pipeline (BUILD.md section 48): secret redaction.
 *
 * This module runs BEFORE persistence, never after. Claude Code and Codex
 * transcripts contain raw commands, file contents and shell output, any of
 * which can carry a credential, so there must be no point in time at which an
 * unredacted payload exists in the database.
 *
 * Design stance: match well-known credential FORMATS. Entropy heuristics are
 * deliberately not used - they flag git SHAs, base64 images and minified code,
 * and a redactor that cries wolf gets switched off. Formats we cannot recognize
 * are handled the other way round: by not storing raw payloads at all unless
 * the operator opts in.
 */

export interface RedactionHit {
  readonly kind: string;
  readonly count: number;
}

export interface RedactionResult<T> {
  readonly value: T;
  readonly redactions: readonly RedactionHit[];
}

interface Pattern {
  readonly kind: string;
  readonly source: string;
  readonly flags: string;
  /** `$n` references are honoured, so a scheme or key name can be preserved. */
  readonly replacement: string;
}

const placeholder = (kind: string): string => `[REDACTED:${kind}]`;

/**
 * Order matters. The most specific patterns run first, so that a value matched
 * as an Anthropic key is not re-matched by the generic `sk-` rule, and a PEM
 * block is removed whole rather than line by line.
 */
const PATTERNS: readonly Pattern[] = [
  {
    kind: "private_key",
    source: "-----BEGIN[A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END[A-Z ]*PRIVATE KEY-----",
    flags: "gu",
    replacement: placeholder("private_key"),
  },
  {
    kind: "anthropic_api_key",
    source: "sk-ant-[A-Za-z0-9_-]{16,}",
    flags: "gu",
    replacement: placeholder("anthropic_api_key"),
  },
  {
    kind: "openai_api_key",
    source: "sk-(?:proj-)?[A-Za-z0-9_-]{20,}",
    flags: "gu",
    replacement: placeholder("openai_api_key"),
  },
  {
    kind: "github_token",
    source: "gh[pousr]_[A-Za-z0-9]{16,}",
    flags: "gu",
    replacement: placeholder("github_token"),
  },
  {
    kind: "aws_access_key_id",
    source: "AKIA[0-9A-Z]{16}",
    flags: "gu",
    replacement: placeholder("aws_access_key_id"),
  },
  {
    kind: "google_api_key",
    source: "AIza[0-9A-Za-z_-]{35}",
    flags: "gu",
    replacement: placeholder("google_api_key"),
  },
  {
    kind: "slack_token",
    source: "xox[baprse]-[A-Za-z0-9-]{10,}",
    flags: "gu",
    replacement: placeholder("slack_token"),
  },
  {
    kind: "jwt",
    source: "eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}",
    flags: "gu",
    replacement: placeholder("jwt"),
  },
  {
    kind: "bearer_token",
    source: "\\b(Bearer|Token)\\s+[A-Za-z0-9._~+/=-]{16,}",
    flags: "giu",
    replacement: `$1 ${placeholder("bearer_token")}`,
  },
  {
    // Credentials embedded in a URL: https://user:password@host
    kind: "url_credentials",
    source: "([a-zA-Z][a-zA-Z0-9+.-]*:\\/\\/)[^\\s/:@]+:[^\\s/@]+@",
    flags: "gu",
    replacement: `$1${placeholder("url_credentials")}@`,
  },
  {
    // FOO_API_KEY=..., SECRET: "...", DB_PASSWORD='...'
    kind: "secret_assignment",
    source:
      "\\b([A-Za-z0-9_]*(?:API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?|PRIVATE_KEY)[A-Za-z0-9_]*)(\\s*[=:]\\s*)(\"[^\"]*\"|'[^']*'|[^\\s;,]+)",
    flags: "giu",
    replacement: `$1$2${placeholder("secret_assignment")}`,
  },
  {
    // Long-form credential flags only. Short flags such as -p are ambiguous
    // (docker -p is a port, npm -p is a package) and are left alone.
    kind: "credential_flag",
    source:
      "(--(?:password|passwd|token|api-key|apikey|secret|credential))([= ])(\"[^\"]*\"|'[^']*'|\\S+)",
    flags: "giu",
    replacement: `$1$2${placeholder("credential_flag")}`,
  },
];

/** Guards against pathological nesting in a hostile or buggy payload. */
const MAX_DEPTH = 8;

/** Redacts a single string, reporting which kinds of secret were found. */
export function redactString(value: string): RedactionResult<string> {
  let output = value;
  const redactions: RedactionHit[] = [];

  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = output.match(regex);
    if (matches === null) continue;
    output = output.replace(regex, pattern.replacement);
    redactions.push({ kind: pattern.kind, count: matches.length });
  }

  return { value: output, redactions };
}

function mergeHits(target: Map<string, number>, hits: readonly RedactionHit[]): void {
  for (const hit of hits) {
    target.set(hit.kind, (target.get(hit.kind) ?? 0) + hit.count);
  }
}

function redactValue(value: unknown, depth: number, hits: Map<string, number>): unknown {
  if (typeof value === "string") {
    const result = redactString(value);
    mergeHits(hits, result.redactions);
    return result.value;
  }

  if (depth >= MAX_DEPTH || value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1, hits));
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = redactValue(item, depth + 1, hits);
  }
  return output;
}

/** Recursively redacts every string in a value, leaving its shape untouched. */
export function redactDeep<T>(value: T): RedactionResult<T> {
  const hits = new Map<string, number>();
  const redacted = redactValue(value, 0, hits) as T;
  return {
    value: redacted,
    redactions: [...hits.entries()].map(([kind, count]) => ({ kind, count })),
  };
}

/**
 * Redacts an event.
 *
 * `id`, `sessionId`, `timestamp`, `source` and `type` are structural and are
 * passed through untouched - redacting them would corrupt the record without
 * protecting anything.
 */
export function redactEvent(event: NormalizedAgentEvent): RedactionResult<NormalizedAgentEvent> {
  const hits = new Map<string, number>();

  const redactField = <T>(value: T): T => {
    const result = redactDeep(value);
    mergeHits(hits, result.redactions);
    return result.value;
  };

  const redacted: NormalizedAgentEvent = {
    ...event,
    signature: redactField(event.signature),
    ...(event.tool !== undefined ? { tool: redactField(event.tool) } : {}),
    ...(event.files !== undefined ? { files: redactField(event.files) } : {}),
    ...(event.metadata !== undefined ? { metadata: redactField(event.metadata) } : {}),
  };

  return {
    value: redacted,
    redactions: [...hits.entries()].map(([kind, count]) => ({ kind, count })),
  };
}

/** The credential kinds this module recognizes. Surfaced by `observatory doctor`. */
export function redactionKinds(): readonly string[] {
  return PATTERNS.map((pattern) => pattern.kind);
}
