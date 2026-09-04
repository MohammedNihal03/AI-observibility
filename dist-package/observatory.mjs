#!/usr/bin/env node
import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname__ } from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname__(__filename);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// packages/telemetry/dist/errors.js
var EventValidationError;
var init_errors = __esm({
  "packages/telemetry/dist/errors.js"() {
    "use strict";
    EventValidationError = class _EventValidationError extends Error {
      issues;
      constructor(issues) {
        const summary = issues.map((issue) => `${issue.path === "" ? "(root)" : issue.path}: ${issue.message}`).join("; ");
        super(`Invalid agent event - ${summary}`);
        this.name = "EventValidationError";
        this.issues = issues;
      }
      static fromZodError(error) {
        return new _EventValidationError(error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
          code: issue.code
        })));
      }
      toJSON() {
        return { error: "invalid_event", issues: this.issues };
      }
    };
  }
});

// packages/shared/dist/version.js
var OBSERVATORY_VERSION;
var init_version = __esm({
  "packages/shared/dist/version.js"() {
    "use strict";
    OBSERVATORY_VERSION = "0.1.0";
  }
});

// packages/shared/dist/events.js
import { z } from "zod";
function isActionEvent(event) {
  return ACTION_EVENT_TYPES.includes(event.type);
}
function isOutcomeEvent(event) {
  return OUTCOME_EVENT_TYPES.includes(event.type);
}
function isFailure(event) {
  if (event.type === "error")
    return true;
  if (event.result?.status === "error")
    return true;
  return event.result?.exitCode !== void 0 && event.result.exitCode !== 0;
}
function isSuccess(event) {
  if (isFailure(event))
    return false;
  if (event.result?.status === "success")
    return true;
  return event.result?.exitCode === 0;
}
var AGENT_SOURCES, agentSourceSchema, AGENT_EVENT_TYPES, agentEventTypeSchema, RESULT_STATUSES, resultStatusSchema, RESULT_CONFIDENCES, resultConfidenceSchema, nonEmptyString, tokenCount, isoTimestampSchema, eventToolSchema, eventResultSchema, eventTokensSchema, eventFilesSchema, eventBodyShape, agentEventSchema, agentEventInputSchema, normalizedAgentEventSchema, ACTION_EVENT_TYPES, OUTCOME_EVENT_TYPES;
var init_events = __esm({
  "packages/shared/dist/events.js"() {
    "use strict";
    AGENT_SOURCES = ["claude_code", "codex", "generic"];
    agentSourceSchema = z.enum(AGENT_SOURCES);
    AGENT_EVENT_TYPES = [
      "session_started",
      "session_ended",
      "user_message",
      "assistant_message",
      "tool_call",
      "tool_result",
      "file_read",
      "file_write",
      "file_edit",
      "command_started",
      "command_finished",
      "test_started",
      "test_finished",
      "error",
      "warning",
      "search",
      "git_operation",
      "context_update",
      "model_response"
    ];
    agentEventTypeSchema = z.enum(AGENT_EVENT_TYPES);
    RESULT_STATUSES = ["success", "error", "unknown"];
    resultStatusSchema = z.enum(RESULT_STATUSES);
    RESULT_CONFIDENCES = ["reported", "inferred"];
    resultConfidenceSchema = z.enum(RESULT_CONFIDENCES);
    nonEmptyString = z.string().min(1);
    tokenCount = z.number().int().nonnegative();
    isoTimestampSchema = z.iso.datetime({ offset: true });
    eventToolSchema = z.object({
      name: nonEmptyString,
      command: z.string().optional(),
      /**
       * What the tool acted on, when it is not a command or a file path: a search
       * pattern, a URL, a query.
       *
       * This exists because repetition detection needs to tell two calls to the
       * same tool apart. Without it, fourteen different `Grep` searches all reduce
       * to the signature `tool_call|tool:Grep` and read as one action repeated
       * fourteen times - which on a real session produced a 60% repetition rate and
       * a fabricated "repetition increased 414%" finding.
       *
       * Adapters should populate it for any tool whose behavior is driven by an
       * argument other than a command or path.
       */
      target: z.string().optional()
    });
    eventResultSchema = z.object({
      status: resultStatusSchema.optional(),
      exitCode: z.number().int().optional(),
      durationMs: z.number().nonnegative().optional(),
      confidence: resultConfidenceSchema.optional()
    });
    eventTokensSchema = z.object({
      input: tokenCount.optional(),
      output: tokenCount.optional(),
      cached: tokenCount.optional()
    });
    eventFilesSchema = z.object({
      path: z.string().optional()
    });
    eventBodyShape = {
      source: agentSourceSchema,
      type: agentEventTypeSchema,
      tool: eventToolSchema.optional(),
      result: eventResultSchema.optional(),
      tokens: eventTokensSchema.optional(),
      files: eventFilesSchema.optional(),
      metadata: z.record(z.string(), z.unknown()).optional()
    };
    agentEventSchema = z.object({
      id: nonEmptyString,
      sessionId: nonEmptyString,
      timestamp: isoTimestampSchema,
      ...eventBodyShape
    });
    agentEventInputSchema = z.object({
      id: nonEmptyString.optional(),
      sessionId: nonEmptyString.optional(),
      timestamp: isoTimestampSchema.optional(),
      ...eventBodyShape
    });
    normalizedAgentEventSchema = agentEventSchema.extend({
      signature: nonEmptyString
    });
    ACTION_EVENT_TYPES = [
      "tool_call",
      "file_read",
      "file_write",
      "file_edit",
      "command_started",
      "test_started",
      "search",
      "git_operation"
    ];
    OUTCOME_EVENT_TYPES = [
      "tool_result",
      "command_finished",
      "test_finished"
    ];
  }
});

// packages/shared/dist/session.js
import { z as z2 } from "zod";
var SESSION_STATUSES, sessionStatusSchema, AGENT_STATES, agentStateSchema, nonEmptyString2, sessionRecordSchema, sessionCreateSchema, sessionUpdateSchema;
var init_session = __esm({
  "packages/shared/dist/session.js"() {
    "use strict";
    init_events();
    SESSION_STATUSES = ["active", "completed", "aborted"];
    sessionStatusSchema = z2.enum(SESSION_STATUSES);
    AGENT_STATES = ["improving", "stable", "degrading", "insufficient_data"];
    agentStateSchema = z2.enum(AGENT_STATES);
    nonEmptyString2 = z2.string().min(1);
    sessionRecordSchema = z2.object({
      id: nonEmptyString2,
      source: agentSourceSchema,
      model: z2.string().nullable(),
      /** Optional stated objective, used by goal-drift detection (section 28). */
      goal: z2.string().nullable(),
      /** Keywords associated with the goal (section 28). */
      goalKeywords: z2.array(z2.string()).nullable(),
      startedAt: isoTimestampSchema,
      endedAt: isoTimestampSchema.nullable(),
      status: sessionStatusSchema,
      createdAt: isoTimestampSchema
    });
    sessionCreateSchema = z2.object({
      id: nonEmptyString2.optional(),
      source: agentSourceSchema,
      model: z2.string().optional(),
      goal: z2.string().optional(),
      goalKeywords: z2.array(z2.string()).optional(),
      startedAt: isoTimestampSchema.optional(),
      status: sessionStatusSchema.optional()
    });
    sessionUpdateSchema = z2.object({
      model: z2.string().nullable().optional(),
      goal: z2.string().nullable().optional(),
      goalKeywords: z2.array(z2.string()).nullable().optional(),
      endedAt: isoTimestampSchema.nullable().optional(),
      status: sessionStatusSchema.optional()
    });
  }
});

// packages/shared/dist/signals.js
import { z as z3 } from "zod";
var SIGNAL_TYPES, signalTypeSchema, SIGNAL_SEVERITIES, signalSeveritySchema, nonEmptyString3, signalRecordSchema, signalCreateSchema, REASON_KINDS, reasonKindSchema, reasonSchema;
var init_signals = __esm({
  "packages/shared/dist/signals.js"() {
    "use strict";
    init_events();
    SIGNAL_TYPES = [
      // Repetition (sections 15, 16)
      "repeated_action_detected",
      "repeated_failed_action",
      // V2 (section 65): the same APPROACH repeated, across different targets.
      "repeated_strategy",
      // Recovery and correction (sections 17, 18)
      "correction_loop_completed",
      "recovery_succeeded",
      "recovery_failed",
      // Degradation signals (section 23)
      "increasing_error_rate",
      "increasing_correction_loops",
      "declining_recovery_rate",
      "increasing_tool_waste",
      "possible_goal_drift",
      "high_context_pressure",
      // Positive trend signals (section 19)
      "error_rate_improved",
      "recovery_rate_improved",
      "repetition_reduced",
      "tool_efficiency_improved"
    ];
    signalTypeSchema = z3.enum(SIGNAL_TYPES);
    SIGNAL_SEVERITIES = ["info", "warning", "critical"];
    signalSeveritySchema = z3.enum(SIGNAL_SEVERITIES);
    nonEmptyString3 = z3.string().min(1);
    signalRecordSchema = z3.object({
      id: nonEmptyString3,
      sessionId: nonEmptyString3,
      timestamp: isoTimestampSchema,
      type: signalTypeSchema,
      severity: signalSeveritySchema,
      /** Human-readable, generated from real measurements. Never hand-written prose. */
      message: nonEmptyString3,
      metadata: z3.record(z3.string(), z3.unknown()).nullable()
    });
    signalCreateSchema = z3.object({
      id: nonEmptyString3.optional(),
      sessionId: nonEmptyString3,
      timestamp: isoTimestampSchema.optional(),
      type: signalTypeSchema,
      severity: signalSeveritySchema,
      message: nonEmptyString3,
      metadata: z3.record(z3.string(), z3.unknown()).optional()
    });
    REASON_KINDS = ["positive", "neutral", "warning", "negative"];
    reasonKindSchema = z3.enum(REASON_KINDS);
    reasonSchema = z3.object({
      type: reasonKindSchema,
      message: nonEmptyString3,
      /** The metric this reason was derived from, so a claim can be traced back. */
      metric: z3.string().optional(),
      /** The measured change that justifies the message, where one applies. */
      delta: z3.number().optional()
    });
  }
});

// packages/shared/dist/metrics.js
import { z as z4 } from "zod";
var nonEmptyString4, score, rate, metricsSnapshotSchema, metricsSnapshotCreateSchema;
var init_metrics = __esm({
  "packages/shared/dist/metrics.js"() {
    "use strict";
    init_events();
    nonEmptyString4 = z4.string().min(1);
    score = z4.number().min(0).max(100).nullable();
    rate = z4.number().min(0).max(1).nullable();
    metricsSnapshotSchema = z4.object({
      id: nonEmptyString4,
      sessionId: nonEmptyString4,
      timestamp: isoTimestampSchema,
      /** 0-100. See docs/scoring.md - these are product bands, not measurements. */
      healthScore: score,
      /** 0-100 behavioral learning. NOT neural-network learning (section 2). */
      learningScore: score,
      /** 0-100, where 0 is no degradation detected (section 24). */
      degradationScore: score,
      successRate: rate,
      errorRate: rate,
      recoveryRate: rate,
      repetitionRate: rate,
      correctionLoopRate: rate,
      toolEfficiency: rate,
      /**
       * Tokens used over the context maximum, 0-1.
       *
       * Null when the provider does not report a maximum and none is configured.
       * A maximum is never invented to produce a percentage (section 29).
       */
      contextPressure: rate
    });
    metricsSnapshotCreateSchema = metricsSnapshotSchema.omit({ id: true, timestamp: true }).extend({
      id: nonEmptyString4.optional(),
      timestamp: isoTimestampSchema.optional(),
      healthScore: score.optional(),
      learningScore: score.optional(),
      degradationScore: score.optional(),
      successRate: rate.optional(),
      errorRate: rate.optional(),
      recoveryRate: rate.optional(),
      repetitionRate: rate.optional(),
      correctionLoopRate: rate.optional(),
      toolEfficiency: rate.optional(),
      contextPressure: rate.optional()
    });
  }
});

// packages/shared/dist/scoring.js
function entriesOf(weights) {
  return Object.entries(weights);
}
function sum(weights) {
  return entriesOf(weights).reduce((total, [, weight]) => total + weight, 0);
}
function validateScoringConfig(config) {
  const problems = [];
  const groups = [
    ["health.weights", config.health.weights],
    ["learning.weights", config.learning.weights],
    ["degradation.weights", config.degradation.weights]
  ];
  for (const [group, weights] of groups) {
    const total = sum(weights);
    if (Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE) {
      problems.push({ group, message: `weights must sum to 1, got ${total}` });
    }
    for (const [name, weight] of entriesOf(weights)) {
      if (weight < 0)
        problems.push({ group, message: `${name} must not be negative` });
    }
  }
  const { healthy, stable, warning } = config.health.bands;
  if (!(healthy > stable && stable > warning)) {
    problems.push({
      group: "health.bands",
      message: "bands must descend: healthy > stable > warning"
    });
  }
  if (config.learning.improvingThreshold <= 0) {
    problems.push({ group: "learning", message: "improvingThreshold must be positive" });
  }
  if (config.learning.degradingThreshold >= 0) {
    problems.push({ group: "learning", message: "degradingThreshold must be negative" });
  }
  if (config.windows.count < 2) {
    problems.push({ group: "windows", message: "at least two windows are needed for a trend" });
  }
  if (config.context.warningThreshold >= config.context.criticalThreshold) {
    problems.push({
      group: "context",
      message: "warningThreshold must be below criticalThreshold"
    });
  }
  return problems;
}
function healthStateFor(score3, config = DEFAULT_SCORING_CONFIG) {
  const { healthy, stable, warning } = config.health.bands;
  if (score3 >= healthy)
    return "healthy";
  if (score3 >= stable)
    return "stable";
  if (score3 >= warning)
    return "warning";
  return "degrading";
}
var DEFAULT_SCORING_CONFIG, WEIGHT_SUM_TOLERANCE;
var init_scoring = __esm({
  "packages/shared/dist/scoring.js"() {
    "use strict";
    DEFAULT_SCORING_CONFIG = {
      health: {
        // Section 25. Recovery carries the most because adapting to a failure is
        // the behavior that most distinguishes a healthy agent from a stuck one.
        weights: {
          recovery: 0.3,
          toolEfficiency: 0.2,
          repetitionAvoidance: 0.2,
          goalAdherence: 0.15,
          contextManagement: 0.15
        },
        bands: { healthy: 80, stable: 60, warning: 40 },
        minComponents: 2
      },
      learning: {
        // Section 20.
        weights: {
          recoveryImprovement: 0.25,
          errorReduction: 0.2,
          repetitionReduction: 0.2,
          goalAdherenceImprovement: 0.2,
          toolEfficiencyImprovement: 0.15
        },
        improvingThreshold: 0.05,
        degradingThreshold: -0.05,
        minObservations: 8
      },
      degradation: {
        // Section 24.
        weights: {
          repeatedFailedActions: 0.3,
          increasingErrors: 0.2,
          recoveryDecline: 0.2,
          correctionLoops: 0.15,
          goalDrift: 0.1,
          contextPressure: 0.05
        },
        repeatedFailureSaturation: 3,
        correctionLoopSaturation: 5
      },
      repetition: {
        minOccurrences: 2,
        consecutiveFailureThreshold: 3
      },
      windows: {
        count: 3,
        minEventsPerWindow: 3
      },
      context: {
        warningThreshold: 0.75,
        criticalThreshold: 0.9
      },
      explain: {
        minReportableDelta: 0.05,
        maxReasons: 6
      }
    };
    WEIGHT_SUM_TOLERANCE = 1e-9;
  }
});

// packages/shared/dist/compare.js
var LOWER_IS_BETTER;
var init_compare = __esm({
  "packages/shared/dist/compare.js"() {
    "use strict";
    LOWER_IS_BETTER = ["errorRate", "repetitionRate"];
  }
});

// packages/shared/dist/index.js
var CONTRACT_VERSION;
var init_dist = __esm({
  "packages/shared/dist/index.js"() {
    "use strict";
    init_version();
    init_events();
    init_session();
    init_signals();
    init_metrics();
    init_scoring();
    init_compare();
    CONTRACT_VERSION = 1;
  }
});

// packages/telemetry/dist/validate.js
function parseEventInput(raw) {
  const result = agentEventInputSchema.safeParse(raw);
  if (!result.success)
    throw EventValidationError.fromZodError(result.error);
  return result.data;
}
function tryParseEventInput(raw) {
  const result = agentEventInputSchema.safeParse(raw);
  return result.success ? { ok: true, event: result.data } : { ok: false, error: EventValidationError.fromZodError(result.error) };
}
var init_validate = __esm({
  "packages/telemetry/dist/validate.js"() {
    "use strict";
    init_dist();
    init_errors();
  }
});

// packages/telemetry/dist/normalize.js
function normalizeWhitespace(value2) {
  return value2.replace(/\s+/gu, " ").trim();
}
function escapeRegExp(value2) {
  return value2.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
function prefixMatcher(prefix) {
  const segments = prefix.replace(/[\\/]+$/u, "").split(/[\\/]+/u).map(escapeRegExp);
  return new RegExp(segments.join("[\\\\/]"), "giu");
}
function normalizePath(value2, options = {}) {
  let path = value2.trim().replace(/^file:\/\//iu, "");
  path = path.replace(/\\/gu, "/").replace(/\/{2,}/gu, "/");
  path = path.replace(/^\/([a-zA-Z]:\/)/u, "$1");
  path = path.replace(/^([a-zA-Z]):\//u, (_match, drive) => `${drive.toLowerCase()}:/`);
  const cwd = options.cwd?.replace(/\\/gu, "/").replace(/\/+$/u, "");
  if (cwd !== void 0 && cwd !== "") {
    const normalizedCwd = cwd.replace(/^([a-zA-Z]):\//u, (_m, d) => `${d.toLowerCase()}:/`);
    if (path.toLowerCase().startsWith(`${normalizedCwd.toLowerCase()}/`)) {
      path = path.slice(normalizedCwd.length + 1);
    } else if (path.toLowerCase() === normalizedCwd.toLowerCase()) {
      path = ".";
    }
  }
  const home = options.homeDir?.replace(/\\/gu, "/").replace(/\/+$/u, "");
  if (home !== void 0 && home !== "") {
    const normalizedHome = home.replace(/^([a-zA-Z]):\//u, (_m, d) => `${d.toLowerCase()}:/`);
    if (path.toLowerCase().startsWith(`${normalizedHome.toLowerCase()}/`)) {
      path = `~/${path.slice(normalizedHome.length + 1)}`;
    }
  }
  return path.replace(/^\.\//u, "");
}
function stripFlag(tokens, flag) {
  return tokens.filter((token) => token !== flag && !token.startsWith(`${flag}=`));
}
function normalizeCommand(value2, options = {}) {
  let command = normalizeWhitespace(value2).replace(/[;&]+$/u, "").trim();
  const cwd = options.cwd;
  if (cwd !== void 0 && cwd !== "") {
    command = command.replace(prefixMatcher(cwd), ".");
  }
  const home = options.homeDir;
  if (home !== void 0 && home !== "") {
    command = command.replace(prefixMatcher(home), "~");
  }
  command = command.replace(/\\/gu, "/").replace(/(^|\s)\.\//gu, "$1");
  const flags = options.insignificantFlags ?? DEFAULT_INSIGNIFICANT_FLAGS;
  let tokens = command.split(" ").filter((token) => token !== "");
  for (const flag of flags) {
    tokens = stripFlag(tokens, flag);
  }
  return tokens.join(" ");
}
function eventSignature(event, options = {}) {
  const parts = [event.type];
  const command = event.tool?.command;
  if (command !== void 0 && command.trim() !== "") {
    if (event.tool?.name !== void 0)
      parts.push(`tool:${event.tool.name}`);
    parts.push(`cmd:${normalizeCommand(command, options)}`);
    return parts.join("|");
  }
  const path = event.files?.path;
  if (path !== void 0 && path.trim() !== "") {
    if (event.tool?.name !== void 0)
      parts.push(`tool:${event.tool.name}`);
    parts.push(`path:${normalizePath(path, options)}`);
    return parts.join("|");
  }
  const target = event.tool?.target;
  if (target !== void 0 && target.trim() !== "") {
    parts.push(`tool:${event.tool?.name ?? "unknown"}`);
    parts.push(`target:${normalizeWhitespace(target)}`);
    return parts.join("|");
  }
  if (event.tool?.name !== void 0) {
    parts.push(`tool:${event.tool.name}`);
  }
  return parts.join("|");
}
function normalizeEvent(input, context) {
  const options = context.options ?? {};
  const normalized = {
    ...input,
    id: input.id ?? context.id,
    sessionId: input.sessionId ?? context.sessionId,
    timestamp: input.timestamp ?? context.timestamp,
    signature: eventSignature(input, options)
  };
  if (input.tool !== void 0) {
    normalized.tool = {
      ...input.tool,
      ...input.tool.command !== void 0 ? { command: normalizeWhitespace(input.tool.command) } : {}
    };
  }
  if (input.files?.path !== void 0) {
    normalized.files = { ...input.files, path: normalizePath(input.files.path, options) };
  }
  return normalized;
}
var DEFAULT_INSIGNIFICANT_FLAGS;
var init_normalize = __esm({
  "packages/telemetry/dist/normalize.js"() {
    "use strict";
    DEFAULT_INSIGNIFICANT_FLAGS = [
      "--color",
      "--no-color",
      "--progress",
      "--no-progress"
    ];
  }
});

// packages/telemetry/dist/redact.js
function redactString(value2) {
  let output = value2;
  const redactions = [];
  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = output.match(regex);
    if (matches === null)
      continue;
    output = output.replace(regex, pattern.replacement);
    redactions.push({ kind: pattern.kind, count: matches.length });
  }
  return { value: output, redactions };
}
function mergeHits(target, hits) {
  for (const hit of hits) {
    target.set(hit.kind, (target.get(hit.kind) ?? 0) + hit.count);
  }
}
function redactValue(value2, depth, hits) {
  if (typeof value2 === "string") {
    const result = redactString(value2);
    mergeHits(hits, result.redactions);
    return result.value;
  }
  if (depth >= MAX_DEPTH || value2 === null || typeof value2 !== "object") {
    return value2;
  }
  if (Array.isArray(value2)) {
    return value2.map((item) => redactValue(item, depth + 1, hits));
  }
  const output = {};
  for (const [key, item] of Object.entries(value2)) {
    output[key] = redactValue(item, depth + 1, hits);
  }
  return output;
}
function redactDeep(value2) {
  const hits = /* @__PURE__ */ new Map();
  const redacted = redactValue(value2, 0, hits);
  return {
    value: redacted,
    redactions: [...hits.entries()].map(([kind, count2]) => ({ kind, count: count2 }))
  };
}
function redactEvent(event) {
  const hits = /* @__PURE__ */ new Map();
  const redactField = (value2) => {
    const result = redactDeep(value2);
    mergeHits(hits, result.redactions);
    return result.value;
  };
  const redacted = {
    ...event,
    signature: redactField(event.signature),
    ...event.tool !== void 0 ? { tool: redactField(event.tool) } : {},
    ...event.files !== void 0 ? { files: redactField(event.files) } : {},
    ...event.metadata !== void 0 ? { metadata: redactField(event.metadata) } : {}
  };
  return {
    value: redacted,
    redactions: [...hits.entries()].map(([kind, count2]) => ({ kind, count: count2 }))
  };
}
function redactionKinds() {
  return PATTERNS.map((pattern) => pattern.kind);
}
var placeholder, PATTERNS, MAX_DEPTH;
var init_redact = __esm({
  "packages/telemetry/dist/redact.js"() {
    "use strict";
    placeholder = (kind) => `[REDACTED:${kind}]`;
    PATTERNS = [
      {
        kind: "private_key",
        source: "-----BEGIN[A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END[A-Z ]*PRIVATE KEY-----",
        flags: "gu",
        replacement: placeholder("private_key")
      },
      {
        kind: "anthropic_api_key",
        source: "sk-ant-[A-Za-z0-9_-]{16,}",
        flags: "gu",
        replacement: placeholder("anthropic_api_key")
      },
      {
        kind: "openai_api_key",
        source: "sk-(?:proj-)?[A-Za-z0-9_-]{20,}",
        flags: "gu",
        replacement: placeholder("openai_api_key")
      },
      {
        kind: "github_token",
        source: "gh[pousr]_[A-Za-z0-9]{16,}",
        flags: "gu",
        replacement: placeholder("github_token")
      },
      {
        kind: "aws_access_key_id",
        source: "AKIA[0-9A-Z]{16}",
        flags: "gu",
        replacement: placeholder("aws_access_key_id")
      },
      {
        kind: "google_api_key",
        source: "AIza[0-9A-Za-z_-]{35}",
        flags: "gu",
        replacement: placeholder("google_api_key")
      },
      {
        kind: "slack_token",
        source: "xox[baprse]-[A-Za-z0-9-]{10,}",
        flags: "gu",
        replacement: placeholder("slack_token")
      },
      {
        kind: "jwt",
        source: "eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}",
        flags: "gu",
        replacement: placeholder("jwt")
      },
      {
        kind: "bearer_token",
        source: "\\b(Bearer|Token)\\s+[A-Za-z0-9._~+/=-]{16,}",
        flags: "giu",
        replacement: `$1 ${placeholder("bearer_token")}`
      },
      {
        // Credentials embedded in a URL: https://user:password@host
        kind: "url_credentials",
        source: "([a-zA-Z][a-zA-Z0-9+.-]*:\\/\\/)[^\\s/:@]+:[^\\s/@]+@",
        flags: "gu",
        replacement: `$1${placeholder("url_credentials")}@`
      },
      {
        // FOO_API_KEY=..., SECRET: "...", DB_PASSWORD='...'
        kind: "secret_assignment",
        source: `\\b([A-Za-z0-9_]*(?:API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?|PRIVATE_KEY)[A-Za-z0-9_]*)(\\s*[=:]\\s*)("[^"]*"|'[^']*'|[^\\s;,]+)`,
        flags: "giu",
        replacement: `$1$2${placeholder("secret_assignment")}`
      },
      {
        // Long-form credential flags only. Short flags such as -p are ambiguous
        // (docker -p is a port, npm -p is a package) and are left alone.
        kind: "credential_flag",
        source: `(--(?:password|passwd|token|api-key|apikey|secret|credential))([= ])("[^"]*"|'[^']*'|\\S+)`,
        flags: "giu",
        replacement: `$1$2${placeholder("credential_flag")}`
      }
    ];
    MAX_DEPTH = 8;
  }
});

// packages/telemetry/dist/processor.js
import { nanoid } from "nanoid";
function createEventProcessor(options = {}) {
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const idFactory = options.idFactory ?? (() => nanoid());
  const bySession = /* @__PURE__ */ new Map();
  let sequence = 0;
  let rejected = 0;
  let redactionTotal = 0;
  const store = (event) => {
    const existing = bySession.get(event.sessionId);
    if (existing === void 0) {
      bySession.set(event.sessionId, [event]);
    } else {
      existing.push(event);
    }
  };
  const process2 = (sessionId, input) => {
    sequence += 1;
    const normalized = normalizeEvent(input, {
      sessionId,
      id: idFactory(sequence),
      timestamp: now().toISOString(),
      ...options.normalize !== void 0 ? { options: options.normalize } : {}
    });
    const { value: event, redactions } = redactEvent(normalized);
    const processed = { event, redactions };
    redactionTotal += redactions.reduce((total, hit) => total + hit.count, 0);
    options.onEvent?.(processed);
    store(event);
    return processed;
  };
  return {
    ingest(sessionId, raw) {
      return process2(sessionId, parseEventInput(raw));
    },
    tryIngest(sessionId, raw) {
      const parsed = tryParseEventInput(raw);
      if (!parsed.ok) {
        rejected += 1;
        return void 0;
      }
      return process2(sessionId, parsed.event);
    },
    ingestMany(sessionId, raws) {
      return raws.map((raw) => process2(sessionId, parseEventInput(raw)));
    },
    getEvents(sessionId) {
      return bySession.get(sessionId) ?? [];
    },
    getSessionIds() {
      return [...bySession.keys()];
    },
    stats() {
      let events2 = 0;
      for (const list of bySession.values())
        events2 += list.length;
      return { sessions: bySession.size, events: events2, rejected, redactions: redactionTotal };
    },
    clear() {
      bySession.clear();
      sequence = 0;
      rejected = 0;
      redactionTotal = 0;
    }
  };
}
function sequentialIds(prefix = "evt") {
  return (sequence) => `${prefix}_${String(sequence).padStart(6, "0")}`;
}
function fixedClock(start, stepMs = 0) {
  const base = typeof start === "string" ? new Date(start) : start;
  let calls = 0;
  return () => {
    const date = new Date(base.getTime() + calls * stepMs);
    calls += 1;
    return date;
  };
}
var init_processor = __esm({
  "packages/telemetry/dist/processor.js"() {
    "use strict";
    init_normalize();
    init_redact();
    init_validate();
  }
});

// packages/telemetry/dist/index.js
var init_dist2 = __esm({
  "packages/telemetry/dist/index.js"() {
    "use strict";
    init_errors();
    init_validate();
    init_normalize();
    init_redact();
    init_processor();
  }
});

// packages/metrics/dist/counters.js
function computeCounters(events2) {
  if (events2.length === 0)
    return EMPTY;
  let totalToolCalls = 0;
  let successfulOutcomes = 0;
  let failedOutcomes = 0;
  let unresolvedOutcomes = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let commandsExecuted = 0;
  let errors = 0;
  let warnings = 0;
  const filesRead = /* @__PURE__ */ new Set();
  const filesModified = /* @__PURE__ */ new Set();
  for (const event of events2) {
    inputTokens += event.tokens?.input ?? 0;
    outputTokens += event.tokens?.output ?? 0;
    cachedTokens += event.tokens?.cached ?? 0;
    if (event.type === "warning")
      warnings += 1;
    if (isFailure(event))
      errors += 1;
    if (isActionEvent(event))
      totalToolCalls += 1;
    if (event.type === "command_started") {
      commandsExecuted += 1;
    } else if (event.type === "tool_call" && event.tool?.command !== void 0) {
      commandsExecuted += 1;
    }
    const path = event.files?.path;
    if (path !== void 0 && path !== "") {
      if (event.type === "file_read")
        filesRead.add(path);
      if (event.type === "file_write" || event.type === "file_edit")
        filesModified.add(path);
    }
    if (isOutcomeEvent(event)) {
      if (isSuccess(event))
        successfulOutcomes += 1;
      else if (isFailure(event))
        failedOutcomes += 1;
      else
        unresolvedOutcomes += 1;
    }
  }
  const resolvedOutcomes = successfulOutcomes + failedOutcomes;
  let toolResults = 0;
  let successfulToolCalls = 0;
  let failedToolCalls = 0;
  for (const event of events2) {
    if (event.type !== "tool_result")
      continue;
    toolResults += 1;
    if (isSuccess(event))
      successfulToolCalls += 1;
    else if (isFailure(event))
      failedToolCalls += 1;
  }
  return {
    totalEvents: events2.length,
    totalToolCalls,
    successfulToolCalls,
    failedToolCalls,
    inputTokens,
    outputTokens,
    cachedTokens,
    filesRead: filesRead.size,
    filesModified: filesModified.size,
    commandsExecuted,
    errors,
    warnings,
    resolvedOutcomes,
    successfulOutcomes,
    failedOutcomes,
    unresolvedOutcomes,
    toolResults,
    unresolvedToolResults: toolResults - (successfulToolCalls + failedToolCalls),
    unresolvedToolCalls: Math.max(0, totalToolCalls - toolResults)
  };
}
function computeDurationMs(events2) {
  if (events2.length === 0)
    return null;
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const event of events2) {
    const time = Date.parse(event.timestamp);
    if (Number.isNaN(time))
      continue;
    if (time < earliest)
      earliest = time;
    if (time > latest)
      latest = time;
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest))
    return null;
  return latest - earliest;
}
var EMPTY;
var init_counters = __esm({
  "packages/metrics/dist/counters.js"() {
    "use strict";
    init_dist();
    EMPTY = {
      totalEvents: 0,
      totalToolCalls: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      filesRead: 0,
      filesModified: 0,
      commandsExecuted: 0,
      errors: 0,
      warnings: 0,
      resolvedOutcomes: 0,
      successfulOutcomes: 0,
      failedOutcomes: 0,
      unresolvedOutcomes: 0,
      toolResults: 0,
      unresolvedToolResults: 0,
      unresolvedToolCalls: 0
    };
  }
});

// packages/metrics/dist/ratio.js
function ratio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator))
    return null;
  if (denominator <= 0)
    return null;
  return numerator / denominator;
}
function rate2(numerator, denominator) {
  const value2 = ratio(numerator, denominator);
  if (value2 === null)
    return null;
  return Math.min(1, Math.max(0, value2));
}
function round(value2, decimals = 4) {
  if (value2 === null)
    return null;
  const factor = 10 ** decimals;
  return Math.round(value2 * factor) / factor;
}
var init_ratio = __esm({
  "packages/metrics/dist/ratio.js"() {
    "use strict";
  }
});

// packages/metrics/dist/rates.js
function successRate(counters) {
  return rate2(counters.successfulOutcomes, counters.resolvedOutcomes);
}
function errorRate(counters) {
  return rate2(counters.failedOutcomes, counters.resolvedOutcomes);
}
function toolEfficiency(counters) {
  return rate2(counters.successfulToolCalls, counters.toolResults);
}
function recoveryRate(counts) {
  return rate2(counts.recoveries, counts.failures);
}
function repetitionRate(repeatedActions, totalActions) {
  return rate2(repeatedActions, totalActions);
}
function correctionLoopRate(counts) {
  return rate2(counts.successfulCorrectionLoops, counts.correctionLoops);
}
function behavioralRates(counts, totalActions) {
  return {
    recoveryRate: recoveryRate(counts),
    repetitionRate: repetitionRate(counts.repeatedActions, totalActions),
    correctionLoopRate: correctionLoopRate(counts)
  };
}
var init_rates = __esm({
  "packages/metrics/dist/rates.js"() {
    "use strict";
    init_ratio();
  }
});

// packages/metrics/dist/tokens.js
function computeTokenUsage(events2) {
  let input = 0;
  let output = 0;
  let cached = 0;
  for (const event of events2) {
    input += event.tokens?.input ?? 0;
    output += event.tokens?.output ?? 0;
    cached += event.tokens?.cached ?? 0;
  }
  return { input, output, cached, total: input + output + cached };
}
function computeContextUsage(events2, options = {}) {
  const tokens = computeTokenUsage(events2);
  let used = 0;
  for (const event of events2) {
    if (event.tokens === void 0)
      continue;
    const live = (event.tokens.input ?? 0) + (event.tokens.cached ?? 0);
    if (live > used)
      used = live;
  }
  let maximum = null;
  let maximumSource = "unknown";
  if (typeof options.reportedMaximum === "number" && options.reportedMaximum > 0) {
    maximum = options.reportedMaximum;
    maximumSource = "reported";
  } else if (typeof options.configuredMaximum === "number" && options.configuredMaximum > 0) {
    maximum = options.configuredMaximum;
    maximumSource = "configured";
  }
  return {
    tokens,
    used,
    maximum,
    maximumSource,
    utilization: maximum === null ? null : rate2(used, maximum)
  };
}
function computeCost(tokens, options = {}) {
  if (typeof options.reportedUsd === "number" && Number.isFinite(options.reportedUsd)) {
    return { amountUsd: options.reportedUsd, source: "reported" };
  }
  const pricing = options.pricing;
  if (pricing === void 0) {
    return { amountUsd: null, source: "unavailable" };
  }
  const perMillion = (count2, price) => count2 / 1e6 * price;
  const cachedPrice = pricing.cachedInputPerMillionUsd ?? pricing.inputPerMillionUsd;
  const amountUsd = perMillion(tokens.input, pricing.inputPerMillionUsd) + perMillion(tokens.output, pricing.outputPerMillionUsd) + perMillion(tokens.cached, cachedPrice);
  return { amountUsd, source: "estimated" };
}
var init_tokens = __esm({
  "packages/metrics/dist/tokens.js"() {
    "use strict";
    init_ratio();
  }
});

// packages/metrics/dist/session.js
function countActions(events2) {
  let total = 0;
  for (const event of events2) {
    if (isActionEvent(event))
      total += 1;
  }
  return total;
}
function computeSessionMetrics(events2, options = {}) {
  const counters = computeCounters(events2);
  const context = computeContextUsage(events2, options.context);
  const cost = computeCost(context.tokens, options.cost);
  const behavior = options.behavior !== void 0 ? behavioralRates(options.behavior, options.behavior.measurableActions ?? countActions(events2)) : { recoveryRate: null, repetitionRate: null, correctionLoopRate: null };
  return {
    counters: {
      totalEvents: counters.totalEvents,
      totalToolCalls: counters.totalToolCalls,
      successfulToolCalls: counters.successfulToolCalls,
      failedToolCalls: counters.failedToolCalls,
      inputTokens: counters.inputTokens,
      outputTokens: counters.outputTokens,
      cachedTokens: counters.cachedTokens,
      filesRead: counters.filesRead,
      filesModified: counters.filesModified,
      commandsExecuted: counters.commandsExecuted,
      errors: counters.errors,
      warnings: counters.warnings
    },
    successRate: round(successRate(counters)),
    errorRate: round(errorRate(counters)),
    toolEfficiency: round(toolEfficiency(counters)),
    recoveryRate: round(behavior.recoveryRate),
    repetitionRate: round(behavior.repetitionRate),
    correctionLoopRate: round(behavior.correctionLoopRate),
    // Goal adherence needs the goal-drift detector, which is Phase 5. Null is
    // the honest value until then - it is never defaulted to 1 ("perfectly on
    // task") or 0 ("completely adrift").
    goalAdherence: null,
    tokens: context.tokens,
    context,
    contextPressure: round(context.utilization),
    cost,
    durationMs: computeDurationMs(events2),
    unresolvedToolCalls: counters.unresolvedToolCalls
  };
}
var init_session2 = __esm({
  "packages/metrics/dist/session.js"() {
    "use strict";
    init_dist();
    init_counters();
    init_rates();
    init_ratio();
    init_tokens();
  }
});

// packages/metrics/dist/index.js
var init_dist3 = __esm({
  "packages/metrics/dist/index.js"() {
    "use strict";
    init_counters();
    init_ratio();
    init_rates();
    init_tokens();
    init_session2();
  }
});

// packages/behavior/dist/degradation.js
function computeDegradation(inputs, config = DEFAULT_SCORING_CONFIG) {
  const weights = config.degradation.weights;
  const { trends, repetition, loops } = inputs;
  const failureRun = repetition.longestConsecutiveFailureRun > 1 ? repetition.longestConsecutiveFailureRun : 0;
  const repeatedFailureSeverity = repetition.repeatedFailedActions === 0 && failureRun === 0 ? 0 : Math.min(1, Math.max(failureRun, repetition.repeatedFailedActions) / config.degradation.repeatedFailureSaturation);
  const loopPressure = loops.correctionLoops + loops.blindRetries === 0 ? 0 : Math.min(1, (loops.failedCorrectionLoops + loops.blindRetries) / config.degradation.correctionLoopSaturation);
  const contextSeverity = (() => {
    if (inputs.contextPressure === null)
      return null;
    const { warningThreshold, criticalThreshold } = config.context;
    if (inputs.contextPressure <= warningThreshold)
      return 0;
    const span = criticalThreshold - warningThreshold;
    return Math.min(1, (inputs.contextPressure - warningThreshold) / span);
  })();
  const raw = [
    {
      name: "repeatedFailedActions",
      severity: repeatedFailureSeverity,
      weight: weights.repeatedFailedActions,
      evidence: repetition.longestConsecutiveFailureRun > 1 ? `an action failed ${repetition.longestConsecutiveFailureRun} times in a row` : repetition.repeatedFailedActions > 0 ? `${repetition.repeatedFailedActions} repeated failed actions` : null
    },
    {
      // Signal 1: increasing error rate.
      name: "increasingErrors",
      severity: rise(trends.errorRate.delta),
      weight: weights.increasingErrors,
      evidence: trends.errorRate.delta === null ? null : `error rate moved ${(trends.errorRate.delta * 100).toFixed(1)} points`
    },
    {
      // Signal 4: declining recovery rate. A fall is a rise in severity.
      name: "recoveryDecline",
      severity: trends.recoveryRate.delta === null ? null : rise(-trends.recoveryRate.delta),
      weight: weights.recoveryDecline,
      evidence: trends.recoveryRate.delta === null ? null : `recovery rate moved ${(trends.recoveryRate.delta * 100).toFixed(1)} points`
    },
    {
      name: "correctionLoops",
      severity: loopPressure,
      weight: weights.correctionLoops,
      evidence: loops.correctionLoops + loops.blindRetries > 0 ? `${loops.correctionLoops} correction loops (${loops.failedCorrectionLoops} failed), ${loops.blindRetries} retries with no change` : null
    },
    {
      // Signal 6: possible goal drift. Named "possible" on purpose - the
      // keyword detector is a lexical proxy, not a reading of intent.
      name: "goalDrift",
      severity: trends.goalAdherence.last === null ? null : rise(1 - trends.goalAdherence.last),
      weight: weights.goalDrift,
      evidence: trends.goalAdherence.last === null ? null : `${(trends.goalAdherence.last * 100).toFixed(0)}% of recent actions related to the stated goal`
    },
    {
      // Signal 7. Smallest weight, and the message reports the observation
      // without asserting a cause.
      name: "contextPressure",
      severity: contextSeverity,
      weight: weights.contextPressure,
      evidence: inputs.contextPressure === null ? null : `context utilization ${(inputs.contextPressure * 100).toFixed(0)}%`
    }
  ];
  const measured = raw.filter((signal) => signal.severity !== null);
  const totalWeight = measured.reduce((total, signal) => total + signal.weight, 0);
  if (measured.length === 0 || totalWeight <= 0) {
    return {
      score: null,
      signals: raw.map((signal) => ({ ...signal, effectiveWeight: 0 })),
      measuredSignals: 0,
      activeSignals: []
    };
  }
  const signals2 = raw.map((signal) => ({
    ...signal,
    effectiveWeight: signal.severity === null ? 0 : signal.weight / totalWeight
  }));
  const score3 = Math.round(Math.min(100, Math.max(0, signals2.reduce((total, signal) => total + (signal.severity ?? 0) * signal.effectiveWeight * 100, 0))));
  const activeSignals = signals2.filter((signal) => (signal.severity ?? 0) >= 0.5).sort((a, b) => (b.severity ?? 0) * b.weight - (a.severity ?? 0) * a.weight);
  return { score: score3, signals: signals2, measuredSignals: measured.length, activeSignals };
}
var rise;
var init_degradation = __esm({
  "packages/behavior/dist/degradation.js"() {
    "use strict";
    init_dist();
    rise = (value2) => value2 === null ? null : Math.min(1, Math.max(0, value2));
  }
});

// packages/behavior/dist/strategy.js
function significantCommand(command) {
  const segments = command.split(/&&|\|\||;|\|/u).map((segment) => segment.trim()).filter((segment) => segment !== "");
  for (const segment of segments) {
    const words = segment.split(/\s+/u).filter((word) => !word.startsWith("-"));
    const program = words[0];
    if (program !== void 0 && !SHELL_PREAMBLE.has(program)) {
      return words.slice(0, 2).join(" ");
    }
  }
  const first = segments[0] ?? command;
  return first.split(/\s+/u).filter((word) => !word.startsWith("-")).slice(0, 2).join(" ");
}
function generalize(signature) {
  const parts = signature.split("|");
  const type = parts[0] ?? "";
  const commandAt = parts.findIndex((part) => part.startsWith("cmd:"));
  const command = commandAt === -1 ? void 0 : parts.slice(commandAt).join("|").slice(4);
  if (command !== void 0 && command !== "") {
    return `run:${significantCommand(command)}`;
  }
  const path = parts.find((part) => part.startsWith("path:"))?.slice(5);
  if (path !== void 0 && path !== "") {
    const segments = path.split("/");
    const directory = segments.length > 1 ? segments.slice(0, -1).join("/") : ".";
    const verb = type === "file_read" ? "read" : "edit";
    return `${verb}:${directory}`;
  }
  const target = parts.find((part) => part.startsWith("target:"));
  if (target !== void 0) {
    const tool = parts.find((part) => part.startsWith("tool:"))?.slice(5) ?? "tool";
    return `search:${tool}`;
  }
  return null;
}
function isVerifiable(signature) {
  return signature.includes("|cmd:");
}
function outcomeOfWindow(verifiable, outcomes, start, length) {
  for (let offset = length - 1; offset >= 0; offset -= 1) {
    const index2 = start + offset;
    if (verifiable[index2] === true)
      return outcomes[index2] ?? null;
  }
  return null;
}
function findOccurrences(steps, outcomes, verifiable, pattern) {
  const found = [];
  let index2 = 0;
  while (index2 + pattern.length <= steps.length) {
    let matches = true;
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (steps[index2 + offset] !== pattern[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      found.push({
        start: index2,
        failed: outcomeOfWindow(verifiable, outcomes, index2, pattern.length)
      });
      index2 += pattern.length;
    } else {
      index2 += 1;
    }
  }
  return found;
}
function detectStrategies(pairs) {
  if (pairs.length < MIN_LENGTH * MIN_OCCURRENCES)
    return EMPTY_STRATEGY;
  const steps = pairs.map((pair) => generalize(pair.action.signature));
  const outcomes = pairs.map((pair) => pair.failed);
  const verifiable = pairs.map((pair) => isVerifiable(pair.action.signature));
  const measurable = steps.filter((step) => step !== null).length;
  const repeated = [];
  const claimed = /* @__PURE__ */ new Set();
  for (let length = Math.min(MAX_LENGTH, Math.floor(steps.length / 2)); length >= MIN_LENGTH; length -= 1) {
    const seen = /* @__PURE__ */ new Set();
    for (let start = 0; start + length <= steps.length; start += 1) {
      const window = steps.slice(start, start + length);
      if (window.some((step) => step === null))
        continue;
      const pattern = window;
      const key = pattern.join(">");
      if (seen.has(key))
        continue;
      seen.add(key);
      const occurrences = findOccurrences(steps, outcomes, verifiable, pattern);
      if (occurrences.length < MIN_OCCURRENCES)
        continue;
      const fresh = occurrences.filter((occurrence) => {
        for (let offset = 0; offset < length; offset += 1) {
          if (!claimed.has(occurrence.start + offset))
            return true;
        }
        return false;
      });
      if (fresh.length < MIN_OCCURRENCES)
        continue;
      for (const occurrence of occurrences) {
        for (let offset = 0; offset < length; offset += 1)
          claimed.add(occurrence.start + offset);
      }
      repeated.push({
        steps: pattern,
        length,
        occurrences: occurrences.length,
        startIndices: occurrences.map((occurrence) => occurrence.start),
        succeeded: occurrences.filter((occurrence) => occurrence.failed === false).length,
        failed: occurrences.filter((occurrence) => occurrence.failed === true).length
      });
    }
  }
  repeated.sort((a, b) => b.length * b.occurrences - a.length * a.occurrences || b.occurrences - a.occurrences || a.startIndices[0] - b.startIndices[0]);
  const unproductive = repeated.filter((strategy) => strategy.succeeded === 0 && strategy.failed >= MIN_OCCURRENCES);
  return {
    repeated,
    unproductive,
    longestStrategy: repeated.reduce((longest, strategy) => Math.max(longest, strategy.length), 0),
    coverage: measurable === 0 ? null : Math.min(1, claimed.size / measurable),
    measuredActions: measurable
  };
}
function describeStrategy(strategy) {
  return strategy.steps.map((step) => {
    const separator = step.indexOf(":");
    if (separator === -1)
      return step;
    const verb = step.slice(0, separator);
    const subject = step.slice(separator + 1);
    return verb === "run" ? subject : `${verb} ${subject}`;
  }).join(" \u2192 ");
}
var MIN_LENGTH, MAX_LENGTH, MIN_OCCURRENCES, EMPTY_STRATEGY, SHELL_PREAMBLE;
var init_strategy = __esm({
  "packages/behavior/dist/strategy.js"() {
    "use strict";
    MIN_LENGTH = 2;
    MAX_LENGTH = 6;
    MIN_OCCURRENCES = 2;
    EMPTY_STRATEGY = {
      repeated: [],
      unproductive: [],
      longestStrategy: 0,
      coverage: null,
      measuredActions: 0
    };
    SHELL_PREAMBLE = /* @__PURE__ */ new Set([
      "cd",
      "pushd",
      "popd",
      "export",
      "set",
      "source",
      ".",
      "true"
    ]);
  }
});

// packages/behavior/dist/trends.js
function isLowerBetter(metric) {
  return LOWER_IS_BETTER2.has(metric);
}
function computeTrend(windows, metric) {
  const points = [];
  windows.forEach((window, index2) => {
    const value2 = window[metric];
    if (typeof value2 === "number")
      points.push({ x: index2, y: value2 });
  });
  if (points.length === 0)
    return EMPTY_TREND(metric);
  const first = points[0]?.y ?? null;
  const last = points[points.length - 1]?.y ?? null;
  if (points.length === 1 || first === null || last === null) {
    return {
      metric,
      first,
      last,
      delta: null,
      slope: null,
      relativeChange: null,
      observations: points.length
    };
  }
  const n = points.length;
  const meanX = points.reduce((total, point) => total + point.x, 0) / n;
  const meanY = points.reduce((total, point) => total + point.y, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (const point of points) {
    covariance += (point.x - meanX) * (point.y - meanY);
    variance += (point.x - meanX) ** 2;
  }
  const slope = variance === 0 ? 0 : covariance / variance;
  const delta = last - first;
  return {
    metric,
    first,
    last,
    delta,
    slope,
    // Relative change is undefined against a baseline of zero. An error rate
    // going from 0 to 0.3 has not risen by "infinity percent"; the absolute
    // delta is the only honest description, so this stays null.
    relativeChange: first === 0 ? null : delta / first,
    observations: n
  };
}
function computeTrends(windows) {
  const entries = TREND_METRICS.map((metric) => [metric, computeTrend(windows, metric)]);
  return Object.fromEntries(entries);
}
function improvementOf(trend) {
  if (trend.delta === null)
    return null;
  return isLowerBetter(trend.metric) ? -trend.delta : trend.delta;
}
var TREND_METRICS, LOWER_IS_BETTER2, EMPTY_TREND;
var init_trends = __esm({
  "packages/behavior/dist/trends.js"() {
    "use strict";
    TREND_METRICS = [
      "successRate",
      "errorRate",
      "toolEfficiency",
      "recoveryRate",
      "repetitionRate",
      "correctionLoopRate",
      "goalAdherence"
    ];
    LOWER_IS_BETTER2 = /* @__PURE__ */ new Set([
      "errorRate",
      "repetitionRate"
    ]);
    EMPTY_TREND = (metric) => ({
      metric,
      first: null,
      last: null,
      delta: null,
      slope: null,
      relativeChange: null,
      observations: 0
    });
  }
});

// packages/behavior/dist/explain.js
function describeChange(trend) {
  if (trend.delta === null || trend.delta === 0)
    return null;
  const label = METRIC_LABELS3[trend.metric];
  const rose = trend.delta > 0;
  const verb = rose ? "increased" : "decreased";
  if (trend.relativeChange !== null && Math.abs(trend.relativeChange) >= 5e-3) {
    const percent2 = Math.abs(trend.relativeChange * 100);
    return { message: `${label} ${verb} ${percent2.toFixed(0)}%`, delta: trend.delta };
  }
  const points = Math.abs(trend.delta * 100);
  return { message: `${label} ${verb} ${points.toFixed(1)} points`, delta: trend.delta };
}
function reasonFor(trend, config) {
  if (trend.delta === null)
    return null;
  if (Math.abs(trend.delta) < config.explain.minReportableDelta)
    return null;
  const described = describeChange(trend);
  if (described === null)
    return null;
  const improved = isLowerBetter(trend.metric) ? trend.delta < 0 : trend.delta > 0;
  return {
    type: improved ? "positive" : "negative",
    message: described.message,
    metric: trend.metric,
    delta: described.delta
  };
}
function explainState(inputs, config = DEFAULT_SCORING_CONFIG) {
  const reasons = [];
  for (const trend of Object.values(inputs.trends)) {
    const reason = reasonFor(trend, config);
    if (reason !== null)
      reasons.push(reason);
  }
  if (inputs.repetition.longestConsecutiveFailureRun >= config.repetition.consecutiveFailureThreshold) {
    const worst = inputs.repetition.repeatedSignatures[0];
    reasons.unshift({
      type: "negative",
      message: `The same action failed ${inputs.repetition.longestConsecutiveFailureRun} times in a row` + (worst !== void 0 ? ` (${shortSignature(worst.signature)})` : ""),
      metric: "repeatedFailedActions",
      delta: inputs.repetition.longestConsecutiveFailureRun
    });
  }
  const worstStrategy = inputs.strategies.unproductive[0];
  if (worstStrategy !== void 0) {
    reasons.unshift({
      type: "negative",
      message: `The same approach failed ${worstStrategy.occurrences} times (${describeStrategy(worstStrategy)})`,
      metric: "repeatedStrategy",
      delta: worstStrategy.occurrences
    });
  }
  if (inputs.loops.blindRetries > 0) {
    reasons.push({
      type: "warning",
      message: `${inputs.loops.blindRetries} ${plural(inputs.loops.blindRetries, "retry", "retries")} with no change in between`,
      metric: "blindRetries",
      delta: inputs.loops.blindRetries
    });
  }
  if (inputs.recovery.failures > 0 && inputs.recovery.recoveries === inputs.recovery.failures) {
    reasons.push({
      type: "positive",
      message: `Recovered from all ${inputs.recovery.failures} ${plural(inputs.recovery.failures, "failure", "failures")}`,
      metric: "recoveryRate"
    });
  }
  if (inputs.loops.successfulCorrectionLoops > 0) {
    reasons.push({
      type: "positive",
      message: `${inputs.loops.successfulCorrectionLoops} successful correction ${plural(inputs.loops.successfulCorrectionLoops, "loop", "loops")}`,
      metric: "correctionLoopRate",
      delta: inputs.loops.successfulCorrectionLoops
    });
  }
  if (inputs.contextPressure !== null && inputs.contextPressure >= config.context.warningThreshold) {
    reasons.push({
      type: "warning",
      message: `Context utilization is high (${Math.round(inputs.contextPressure * 100)}%)`,
      metric: "contextPressure",
      delta: inputs.contextPressure
    });
  }
  if (inputs.learning.state === "insufficient_data" && inputs.learning.insufficientReason !== null) {
    reasons.push({
      type: "neutral",
      message: `Not enough data to judge a trend yet - ${inputs.learning.insufficientReason}`,
      metric: "observations"
    });
  }
  return dedupe(reasons).sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0)).slice(0, config.explain.maxReasons);
}
function deriveSignals(sessionId, inputs, config = DEFAULT_SCORING_CONFIG) {
  const signals2 = [];
  for (const strategy of inputs.strategies.unproductive.slice(0, 3)) {
    signals2.push({
      sessionId,
      type: "repeated_strategy",
      severity: strategy.occurrences >= 3 ? "critical" : "warning",
      message: `${describeStrategy(strategy)} \u2014 tried ${strategy.occurrences} times, never worked`,
      metadata: {
        steps: [...strategy.steps],
        occurrences: strategy.occurrences,
        failed: strategy.failed
      }
    });
  }
  for (const repeated of inputs.repetition.repeatedSignatures) {
    if (repeated.longestFailureRun >= config.repetition.consecutiveFailureThreshold) {
      signals2.push({
        sessionId,
        type: "repeated_failed_action",
        severity: "critical",
        message: `${shortSignature(repeated.signature)} failed ${repeated.longestFailureRun} times in a row`,
        metadata: {
          signature: repeated.signature,
          occurrences: repeated.occurrences,
          failures: repeated.failures,
          longestFailureRun: repeated.longestFailureRun
        }
      });
      continue;
    }
    if (repeated.occurrences > config.repetition.minOccurrences) {
      signals2.push({
        sessionId,
        type: "repeated_action_detected",
        severity: "warning",
        message: `${shortSignature(repeated.signature)} ran ${repeated.occurrences} times`,
        metadata: { signature: repeated.signature, occurrences: repeated.occurrences }
      });
    }
  }
  for (const signal of inputs.degradation.activeSignals) {
    if (signal.evidence === null)
      continue;
    signals2.push({
      sessionId,
      type: degradationSignalType(signal.name),
      severity: severityFor(signal.severity ?? 0),
      message: capitalize(signal.evidence),
      metadata: { severity: signal.severity, weight: signal.weight }
    });
  }
  if (inputs.loops.successfulCorrectionLoops > 0) {
    signals2.push({
      sessionId,
      type: "correction_loop_completed",
      severity: "info",
      message: `${inputs.loops.successfulCorrectionLoops} correction ${plural(inputs.loops.successfulCorrectionLoops, "loop", "loops")} ended in success`,
      metadata: {
        correctionLoops: inputs.loops.correctionLoops,
        successful: inputs.loops.successfulCorrectionLoops
      }
    });
  }
  for (const trend of [
    inputs.trends.errorRate,
    inputs.trends.recoveryRate,
    inputs.trends.repetitionRate,
    inputs.trends.toolEfficiency
  ]) {
    if (trend.delta === null || Math.abs(trend.delta) < config.explain.minReportableDelta)
      continue;
    const improved = isLowerBetter(trend.metric) ? trend.delta < 0 : trend.delta > 0;
    if (!improved)
      continue;
    const described = describeChange(trend);
    if (described === null)
      continue;
    signals2.push({
      sessionId,
      type: positiveSignalType(trend.metric),
      severity: "info",
      message: described.message,
      metadata: { metric: trend.metric, delta: trend.delta }
    });
  }
  return signals2;
}
function degradationSignalType(name) {
  switch (name) {
    case "repeatedFailedActions":
      return "repeated_failed_action";
    case "increasingErrors":
      return "increasing_error_rate";
    case "recoveryDecline":
      return "declining_recovery_rate";
    case "correctionLoops":
      return "increasing_correction_loops";
    case "goalDrift":
      return "possible_goal_drift";
    default:
      return "high_context_pressure";
  }
}
function positiveSignalType(metric) {
  switch (metric) {
    case "errorRate":
      return "error_rate_improved";
    case "recoveryRate":
      return "recovery_rate_improved";
    case "repetitionRate":
      return "repetition_reduced";
    default:
      return "tool_efficiency_improved";
  }
}
function severityFor(severity) {
  if (severity >= 0.75)
    return "critical";
  if (severity >= 0.4)
    return "warning";
  return "info";
}
function shortSignature(signature) {
  const parts = signature.split("|");
  const command = parts.find((part) => part.startsWith("cmd:"));
  if (command !== void 0)
    return command.slice(4);
  const path = parts.find((part) => part.startsWith("path:"));
  if (path !== void 0)
    return path.slice(5);
  const tool = parts.find((part) => part.startsWith("tool:"));
  if (tool !== void 0)
    return tool.slice(5);
  return parts[0] ?? signature;
}
function plural(count2, one, many) {
  return count2 === 1 ? one : many;
}
function capitalize(value2) {
  return value2.charAt(0).toUpperCase() + value2.slice(1);
}
function dedupe(reasons) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const reason of reasons) {
    if (seen.has(reason.message))
      continue;
    seen.add(reason.message);
    unique.push(reason);
  }
  return unique;
}
var METRIC_LABELS3;
var init_explain = __esm({
  "packages/behavior/dist/explain.js"() {
    "use strict";
    init_dist();
    init_strategy();
    init_trends();
    METRIC_LABELS3 = {
      successRate: "Success rate",
      errorRate: "Error rate",
      toolEfficiency: "Tool efficiency",
      recoveryRate: "Recovery rate",
      repetitionRate: "Repetition",
      correctionLoopRate: "Correction recovery",
      goalAdherence: "Goal adherence"
    };
  }
});

// packages/behavior/dist/goal-drift.js
function extractKeywords(text2) {
  if (text2 === null || text2.trim() === "")
    return [];
  const tokens = text2.toLowerCase().split(/[^a-z0-9_]+/u).filter((token) => token.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(token) && !/^\d+$/u.test(token));
  return [...new Set(tokens)];
}
function searchableText(event) {
  return [event.signature, event.tool?.name, event.tool?.command, event.files?.path].filter((part) => typeof part === "string").join(" ");
}
function tokenize(text2) {
  return text2.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").toLowerCase().split(/[^a-z0-9]+/u).filter((token) => token.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(token));
}
function stem(token) {
  for (const suffix of ["ations", "ation", "ings", "ing", "ers", "er", "ed", "es", "s"]) {
    if (token.length - suffix.length >= 4 && token.endsWith(suffix)) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}
function tokensMatch(goalToken, actionToken) {
  if (goalToken === actionToken)
    return true;
  const left = stem(goalToken);
  const right = stem(actionToken);
  if (left === right)
    return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.length >= MIN_PREFIX && longer.startsWith(shorter);
}
function createTokenGoalDriftDetector() {
  return {
    name: "token",
    measureAdherence(events2, goal) {
      const goalTokens = [
        .../* @__PURE__ */ new Set([
          ...goal.keywords.flatMap((keyword) => tokenize(keyword)),
          ...tokenize(goal.text ?? "")
        ])
      ];
      if (goalTokens.length === 0)
        return null;
      const actions = events2.filter(isActionEvent);
      if (actions.length === 0)
        return null;
      let related = 0;
      for (const action of actions) {
        const actionTokens = tokenize(searchableText(action));
        const matched = actionTokens.some((actionToken) => goalTokens.some((goalToken) => tokensMatch(goalToken, actionToken)));
        if (matched)
          related += 1;
      }
      if (related === 0)
        return null;
      return related / actions.length;
    }
  };
}
function createKeywordGoalDriftDetector() {
  return {
    name: "keyword",
    measureAdherence(events2, goal) {
      const keywords = [
        .../* @__PURE__ */ new Set([
          ...goal.keywords.map((keyword) => keyword.toLowerCase()),
          ...extractKeywords(goal.text)
        ])
      ].filter((keyword) => keyword.length >= MIN_KEYWORD_LENGTH);
      if (keywords.length === 0)
        return null;
      const actions = events2.filter(isActionEvent);
      if (actions.length === 0)
        return null;
      let related = 0;
      for (const action of actions) {
        const haystack = searchableText(action).toLowerCase();
        if (keywords.some((keyword) => haystack.includes(keyword)))
          related += 1;
      }
      if (related === 0)
        return null;
      return related / actions.length;
    }
  };
}
var STOP_WORDS, MIN_KEYWORD_LENGTH, MIN_PREFIX, NULL_GOAL_DRIFT_DETECTOR;
var init_goal_drift = __esm({
  "packages/behavior/dist/goal-drift.js"() {
    "use strict";
    init_dist();
    STOP_WORDS = /* @__PURE__ */ new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "if",
      "then",
      "than",
      "that",
      "this",
      "these",
      "those",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "to",
      "of",
      "in",
      "on",
      "at",
      "by",
      "for",
      "with",
      "from",
      "into",
      "about",
      "as",
      "it",
      "its",
      "we",
      "i",
      "you",
      "should",
      "would",
      "could",
      "can",
      "will",
      "make",
      "made",
      "do",
      "does",
      "did",
      "get",
      "got",
      "fix",
      "fixes",
      "fixed",
      "issue",
      "issues",
      "problem",
      "bug",
      "please",
      "also",
      "not",
      "no",
      "when",
      "where",
      "why",
      "how",
      "all",
      "any",
      "some",
      "up",
      "out",
      "so",
      "my",
      "our"
    ]);
    MIN_KEYWORD_LENGTH = 3;
    MIN_PREFIX = 4;
    NULL_GOAL_DRIFT_DETECTOR = {
      name: "none",
      measureAdherence: () => null
    };
  }
});

// packages/behavior/dist/health.js
function computeHealth(inputs, config = DEFAULT_SCORING_CONFIG) {
  const weights = config.health.weights;
  const raw = [
    { name: "recovery", value: inputs.recoveryRate, weight: weights.recovery },
    { name: "toolEfficiency", value: inputs.toolEfficiency, weight: weights.toolEfficiency },
    {
      name: "repetitionAvoidance",
      value: inputs.repetitionRate === null ? null : 1 - inputs.repetitionRate,
      weight: weights.repetitionAvoidance
    },
    { name: "goalAdherence", value: inputs.goalAdherence, weight: weights.goalAdherence },
    {
      name: "contextManagement",
      value: inputs.contextPressure === null ? null : 1 - inputs.contextPressure,
      weight: weights.contextManagement
    }
  ];
  const measured = raw.filter((component) => component.value !== null);
  const totalWeight = measured.reduce((total, component) => total + component.weight, 0);
  if (measured.length < config.health.minComponents || totalWeight <= 0) {
    return {
      score: null,
      state: "insufficient_data",
      components: raw.map((component) => ({
        ...component,
        effectiveWeight: 0,
        contribution: 0
      })),
      measuredComponents: measured.length
    };
  }
  const components = raw.map((component) => {
    if (component.value === null) {
      return { ...component, effectiveWeight: 0, contribution: 0 };
    }
    const effectiveWeight = component.weight / totalWeight;
    return {
      ...component,
      effectiveWeight,
      contribution: component.value * effectiveWeight * 100
    };
  });
  const score3 = Math.round(Math.min(100, Math.max(0, components.reduce((total, part) => total + part.contribution, 0))));
  return {
    score: score3,
    state: healthStateFor(score3, config),
    components,
    measuredComponents: measured.length
  };
}
var init_health = __esm({
  "packages/behavior/dist/health.js"() {
    "use strict";
    init_dist();
  }
});

// packages/behavior/dist/learning.js
function computeLearning(trends, windows, config = DEFAULT_SCORING_CONFIG) {
  const weights = config.learning.weights;
  const raw = COMPONENT_METRICS.map((entry) => ({
    name: entry.name,
    metric: entry.metric,
    improvement: improvementOf(trends[entry.metric]),
    weight: weights[entry.name]
  }));
  const measured = raw.filter((component) => component.improvement !== null);
  const tooFewObservations = windows.totalActions < config.learning.minObservations;
  const insufficientReason = windows.windows.length < 2 ? "not enough actions to form rolling windows" : tooFewObservations ? `fewer than ${config.learning.minObservations} actions observed` : windows.insufficient ? "at least one window is too thin to measure" : measured.length === 0 ? "no metric could be compared across windows" : null;
  if (insufficientReason !== null) {
    return {
      score: null,
      state: "insufficient_data",
      weightedImprovement: null,
      components: raw.map((component) => ({ ...component, effectiveWeight: 0 })),
      measuredComponents: measured.length,
      insufficientReason
    };
  }
  const totalWeight = measured.reduce((total, component) => total + component.weight, 0);
  const components = raw.map((component) => ({
    ...component,
    effectiveWeight: component.improvement === null ? 0 : component.weight / totalWeight
  }));
  const weightedImprovement = components.reduce((total, component) => total + (component.improvement ?? 0) * component.effectiveWeight, 0);
  const score3 = Math.round(Math.min(100, Math.max(0, 50 + 50 * weightedImprovement)));
  const state = weightedImprovement > config.learning.improvingThreshold ? "improving" : weightedImprovement < config.learning.degradingThreshold ? "degrading" : "stable";
  return {
    score: score3,
    state,
    weightedImprovement,
    components,
    measuredComponents: measured.length,
    insufficientReason: null
  };
}
var COMPONENT_METRICS;
var init_learning = __esm({
  "packages/behavior/dist/learning.js"() {
    "use strict";
    init_dist();
    init_trends();
    COMPONENT_METRICS = [
      { name: "recoveryImprovement", metric: "recoveryRate" },
      { name: "errorReduction", metric: "errorRate" },
      { name: "repetitionReduction", metric: "repetitionRate" },
      { name: "goalAdherenceImprovement", metric: "goalAdherence" },
      { name: "toolEfficiencyImprovement", metric: "toolEfficiency" }
    ];
  }
});

// packages/behavior/dist/pairing.js
function callIdOf(event) {
  const value2 = event.metadata?.["callId"];
  return typeof value2 === "string" && value2 !== "" ? value2 : void 0;
}
function pairActionsWithOutcomes(events2) {
  const pending = [];
  const byCallId = /* @__PURE__ */ new Map();
  const resolved = /* @__PURE__ */ new Map();
  const actions = [];
  const orphanOutcomes = [];
  events2.forEach((event, index2) => {
    if (isActionEvent(event)) {
      const entry = { action: event, index: index2 };
      actions.push(entry);
      pending.push(entry);
      const callId2 = callIdOf(event);
      if (callId2 !== void 0)
        byCallId.set(callId2, entry);
      return;
    }
    if (!isOutcomeEvent(event))
      return;
    const callId = callIdOf(event);
    if (callId !== void 0) {
      const match = byCallId.get(callId);
      if (match !== void 0 && !resolved.has(match.index)) {
        resolved.set(match.index, { outcome: event, pairedBy: "call_id" });
        byCallId.delete(callId);
        const position = pending.findIndex((entry) => entry.index === match.index);
        if (position >= 0)
          pending.splice(position, 1);
        return;
      }
    }
    const next = pending.pop();
    if (next === void 0) {
      orphanOutcomes.push(event);
      return;
    }
    resolved.set(next.index, { outcome: event, pairedBy: "nearest_preceding" });
  });
  const pairs = actions.map(({ action, index: index2 }) => {
    const match = resolved.get(index2);
    if (match === void 0) {
      const inline = action.result !== void 0 ? outcomeOf(action) : null;
      return { action, index: index2, outcome: void 0, pairedBy: void 0, failed: inline };
    }
    return {
      action,
      index: index2,
      outcome: match.outcome,
      pairedBy: match.pairedBy,
      failed: outcomeOf(match.outcome)
    };
  });
  return { pairs, orphanOutcomes };
}
function outcomeOf(event) {
  if (isFailure(event))
    return true;
  if (isSuccess(event))
    return false;
  return null;
}
function isModification(event) {
  return event.type === "file_write" || event.type === "file_edit";
}
var init_pairing = __esm({
  "packages/behavior/dist/pairing.js"() {
    "use strict";
    init_dist();
  }
});

// packages/behavior/dist/recovery.js
function analyzeRecovery(events2, pairs) {
  if (pairs.length === 0) {
    return { recovery: EMPTY_RECOVERY, loops: EMPTY_CORRECTION_LOOPS };
  }
  const modificationIndices = [];
  events2.forEach((event, index2) => {
    if (isModification(event))
      modificationIndices.push(index2);
  });
  const modifiedBetween = (from, to) => modificationIndices.some((index2) => index2 > from && index2 < to);
  const open = /* @__PURE__ */ new Map();
  const episodes = [];
  let failureEvents = 0;
  let correctionLoops = 0;
  let successfulCorrectionLoops = 0;
  let failedCorrectionLoops = 0;
  let blindRetries = 0;
  for (const pair of pairs) {
    const signature = pair.action.signature;
    const existing = open.get(signature);
    if (pair.failed === true) {
      failureEvents += 1;
      if (existing === void 0) {
        open.set(signature, {
          signature,
          startIndex: pair.index,
          endIndex: pair.index,
          attempts: 1,
          modifiedSinceLastAttempt: false,
          modifiedDuringEpisode: false,
          blindRetries: 0,
          correctionLoops: 0,
          failedCorrectionLoops: 0
        });
        continue;
      }
      const changed = modifiedBetween(existing.endIndex, pair.index);
      if (changed) {
        correctionLoops += 1;
        failedCorrectionLoops += 1;
        existing.correctionLoops += 1;
        existing.failedCorrectionLoops += 1;
        existing.modifiedDuringEpisode = true;
      } else {
        blindRetries += 1;
        existing.blindRetries += 1;
      }
      existing.attempts += 1;
      existing.endIndex = pair.index;
      continue;
    }
    if (pair.failed === false && existing !== void 0) {
      const changed = modifiedBetween(existing.endIndex, pair.index);
      if (changed) {
        correctionLoops += 1;
        successfulCorrectionLoops += 1;
        existing.modifiedDuringEpisode = true;
      } else {
        blindRetries += 1;
        existing.blindRetries += 1;
      }
      episodes.push({
        signature,
        startIndex: existing.startIndex,
        endIndex: existing.endIndex,
        attempts: existing.attempts,
        recoveredAtIndex: pair.index,
        modifiedBetween: existing.modifiedDuringEpisode || changed,
        blindRetries: existing.blindRetries
      });
      open.delete(signature);
    }
  }
  for (const episode of open.values()) {
    episodes.push({
      signature: episode.signature,
      startIndex: episode.startIndex,
      endIndex: episode.endIndex,
      attempts: episode.attempts,
      recoveredAtIndex: null,
      modifiedBetween: episode.modifiedDuringEpisode,
      blindRetries: episode.blindRetries
    });
  }
  episodes.sort((a, b) => a.startIndex - b.startIndex);
  const recoveries = episodes.filter((episode) => episode.recoveredAtIndex !== null).length;
  return {
    recovery: {
      failures: episodes.length,
      recoveries,
      failureEvents,
      episodes,
      unresolvedFailures: episodes.length - recoveries
    },
    loops: {
      correctionLoops,
      successfulCorrectionLoops,
      failedCorrectionLoops,
      blindRetries
    }
  };
}
var EMPTY_RECOVERY, EMPTY_CORRECTION_LOOPS;
var init_recovery = __esm({
  "packages/behavior/dist/recovery.js"() {
    "use strict";
    init_pairing();
    EMPTY_RECOVERY = {
      failures: 0,
      recoveries: 0,
      failureEvents: 0,
      episodes: [],
      unresolvedFailures: 0
    };
    EMPTY_CORRECTION_LOOPS = {
      correctionLoops: 0,
      successfulCorrectionLoops: 0,
      failedCorrectionLoops: 0,
      blindRetries: 0
    };
  }
});

// packages/behavior/dist/repetition.js
function isDiscriminating(signature) {
  return signature.includes("|cmd:") || signature.includes("|path:") || signature.includes("|target:");
}
function detectRepetition(pairs, config = DEFAULT_SCORING_CONFIG) {
  if (pairs.length === 0)
    return EMPTY_REPETITION;
  const tallies = /* @__PURE__ */ new Map();
  let repeatedActions = 0;
  let repeatedFailedActions = 0;
  let measurableActions = 0;
  let unmeasurableActions = 0;
  for (const pair of pairs) {
    const signature = pair.action.signature;
    if (!isDiscriminating(signature)) {
      unmeasurableActions += 1;
      continue;
    }
    measurableActions += 1;
    const existing = tallies.get(signature);
    const tally = existing ?? {
      occurrences: 0,
      failures: 0,
      currentFailureRun: 0,
      longestFailureRun: 0,
      indices: [],
      hasFailedBefore: false
    };
    if (existing === void 0)
      tallies.set(signature, tally);
    else
      repeatedActions += 1;
    tally.occurrences += 1;
    tally.indices.push(pair.index);
    if (pair.failed === true) {
      if (tally.hasFailedBefore)
        repeatedFailedActions += 1;
      tally.hasFailedBefore = true;
      tally.failures += 1;
      tally.currentFailureRun += 1;
      if (tally.currentFailureRun > tally.longestFailureRun) {
        tally.longestFailureRun = tally.currentFailureRun;
      }
    } else if (pair.failed === false) {
      tally.currentFailureRun = 0;
    }
  }
  const repeatedSignatures = [];
  let longestConsecutiveFailureRun = 0;
  for (const [signature, tally] of tallies) {
    if (tally.longestFailureRun > longestConsecutiveFailureRun) {
      longestConsecutiveFailureRun = tally.longestFailureRun;
    }
    if (tally.occurrences >= config.repetition.minOccurrences) {
      repeatedSignatures.push({
        signature,
        occurrences: tally.occurrences,
        repeats: tally.occurrences - 1,
        failures: tally.failures,
        longestFailureRun: tally.longestFailureRun,
        indices: tally.indices
      });
    }
  }
  repeatedSignatures.sort((a, b) => b.longestFailureRun - a.longestFailureRun || b.failures - a.failures || b.occurrences - a.occurrences || a.signature.localeCompare(b.signature));
  return {
    totalActions: measurableActions,
    unmeasurableActions,
    repeatedActions,
    repeatedFailedActions,
    distinctSignatures: tallies.size,
    repeatedSignatures,
    longestConsecutiveFailureRun
  };
}
var EMPTY_REPETITION;
var init_repetition = __esm({
  "packages/behavior/dist/repetition.js"() {
    "use strict";
    init_dist();
    EMPTY_REPETITION = {
      totalActions: 0,
      unmeasurableActions: 0,
      repeatedActions: 0,
      repeatedFailedActions: 0,
      distinctSignatures: 0,
      repeatedSignatures: [],
      longestConsecutiveFailureRun: 0
    };
  }
});

// packages/behavior/dist/windows.js
function labelFor(index2, count2) {
  if (count2 === LABELS.length)
    return LABELS[index2] ?? `window_${index2 + 1}`;
  if (index2 === 0)
    return "early";
  if (index2 === count2 - 1)
    return "recent";
  return `window_${index2 + 1}`;
}
function splitIntoWindows(events2, config = DEFAULT_SCORING_CONFIG) {
  const count2 = Math.max(2, config.windows.count);
  const actionIndices = [];
  events2.forEach((event, index2) => {
    if (isActionEvent(event))
      actionIndices.push(index2);
  });
  if (actionIndices.length < count2)
    return [];
  const perWindow = actionIndices.length / count2;
  const firstActionIndex = [];
  for (let window = 0; window < count2; window += 1) {
    const position = Math.min(actionIndices.length - 1, Math.floor(window * perWindow));
    firstActionIndex.push(actionIndices[position] ?? 0);
  }
  const boundaries = [];
  for (let window = 0; window < count2; window += 1) {
    const startIndex = window === 0 ? 0 : firstActionIndex[window] ?? 0;
    const endIndex = window === count2 - 1 ? events2.length - 1 : (firstActionIndex[window + 1] ?? events2.length) - 1;
    boundaries.push({ startIndex, endIndex });
  }
  return boundaries.filter((boundary) => boundary.endIndex >= boundary.startIndex);
}
function measureWindow(slice, label, startIndex, endIndex, options = {}) {
  const config = options.config ?? DEFAULT_SCORING_CONFIG;
  const counters = computeCounters(slice);
  const { pairs } = pairActionsWithOutcomes(slice);
  const repetition = detectRepetition(pairs, config);
  const { recovery, loops } = analyzeRecovery(slice, pairs);
  const safe = (numerator, denominator) => denominator > 0 ? Math.min(1, Math.max(0, numerator / denominator)) : null;
  return {
    label,
    startIndex,
    endIndex,
    events: slice.length,
    actions: pairs.length,
    successRate: successRate(counters),
    errorRate: errorRate(counters),
    toolEfficiency: toolEfficiency(counters),
    recoveryRate: safe(recovery.recoveries, recovery.failures),
    repetitionRate: safe(repetition.repeatedActions, repetition.totalActions),
    correctionLoopRate: safe(loops.successfulCorrectionLoops, loops.correctionLoops),
    goalAdherence: options.goalAdherenceFor?.(slice) ?? null
  };
}
function computeWindows(events2, options = {}) {
  const config = options.config ?? DEFAULT_SCORING_CONFIG;
  const totalActions = events2.filter(isActionEvent).length;
  const boundaries = splitIntoWindows(events2, config);
  if (boundaries.length < 2) {
    return { windows: [], insufficient: true, totalActions };
  }
  const windows = boundaries.map((boundary, index2) => measureWindow(events2.slice(boundary.startIndex, boundary.endIndex + 1), labelFor(index2, boundaries.length), boundary.startIndex, boundary.endIndex, options));
  const insufficient = windows.some((window) => window.actions < config.windows.minEventsPerWindow);
  return { windows, insufficient, totalActions };
}
var LABELS;
var init_windows = __esm({
  "packages/behavior/dist/windows.js"() {
    "use strict";
    init_dist();
    init_dist3();
    init_pairing();
    init_recovery();
    init_repetition();
    LABELS = ["early", "middle", "recent"];
  }
});

// packages/behavior/dist/analyze.js
function analyzeSession(events2, options = {}) {
  const config = options.config ?? DEFAULT_SCORING_CONFIG;
  const goal = options.goal;
  const detector = options.goalDriftDetector ?? (goal !== void 0 ? createTokenGoalDriftDetector() : NULL_GOAL_DRIFT_DETECTOR);
  const goalAdherenceFor = (slice) => goal === void 0 ? null : detector.measureAdherence(slice, goal);
  const pairing = pairActionsWithOutcomes(events2);
  const repetition = detectRepetition(pairing.pairs, config);
  const strategies = detectStrategies(pairing.pairs);
  const { recovery, loops } = analyzeRecovery(events2, pairing.pairs);
  const goalAdherence = goalAdherenceFor(events2);
  const counts = {
    failures: recovery.failures,
    recoveries: recovery.recoveries,
    repeatedActions: repetition.repeatedActions,
    repeatedFailedActions: repetition.repeatedFailedActions,
    correctionLoops: loops.correctionLoops,
    successfulCorrectionLoops: loops.successfulCorrectionLoops,
    measurableActions: repetition.totalActions
  };
  const baseMetrics = computeSessionMetrics(events2, { ...options.metrics, behavior: counts });
  const metrics2 = { ...baseMetrics, goalAdherence };
  const windows = computeWindows(events2, { config, goalAdherenceFor });
  const trends = computeTrends(windows.windows);
  const health = computeHealth({
    recoveryRate: metrics2.recoveryRate,
    toolEfficiency: metrics2.toolEfficiency,
    repetitionRate: metrics2.repetitionRate,
    goalAdherence,
    contextPressure: metrics2.contextPressure
  }, config);
  const learning = computeLearning(trends, windows, config);
  const degradation = computeDegradation({ trends, repetition, loops, contextPressure: metrics2.contextPressure }, config);
  const explainInputs = {
    trends,
    health,
    learning,
    degradation,
    repetition,
    strategies,
    recovery,
    loops,
    contextPressure: metrics2.contextPressure
  };
  return {
    counts,
    pairing,
    repetition,
    strategies,
    recovery,
    loops,
    windows,
    trends,
    health,
    learning,
    degradation,
    metrics: metrics2,
    goalAdherence,
    reasons: explainState(explainInputs, config),
    signals: deriveSignals("", explainInputs, config),
    currentState: learning.state,
    healthState: health.state
  };
}
function signalsFor(sessionId, analysis) {
  return analysis.signals.map((signal) => ({ ...signal, sessionId }));
}
var init_analyze = __esm({
  "packages/behavior/dist/analyze.js"() {
    "use strict";
    init_dist();
    init_dist3();
    init_degradation();
    init_explain();
    init_goal_drift();
    init_health();
    init_learning();
    init_pairing();
    init_recovery();
    init_repetition();
    init_strategy();
    init_trends();
    init_windows();
  }
});

// packages/behavior/dist/index.js
var init_dist4 = __esm({
  "packages/behavior/dist/index.js"() {
    "use strict";
    init_analyze();
    init_pairing();
    init_strategy();
    init_repetition();
    init_recovery();
    init_windows();
    init_trends();
    init_health();
    init_learning();
    init_degradation();
    init_goal_drift();
    init_explain();
  }
});

// apps/server/dist/config.js
function readPort(value2) {
  if (value2 === void 0 || value2.trim() === "")
    return DEFAULT_PORT;
  const parsed = Number.parseInt(value2, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid OBSERVATORY_PORT: ${value2}`);
  }
  return parsed;
}
function loadConfig(env = process.env) {
  const port = readPort(env.OBSERVATORY_PORT);
  return {
    host: env.OBSERVATORY_HOST ?? "127.0.0.1",
    port,
    allowedOrigins: [
      // The dashboard runs on a dedicated port so it cannot collide with the
      // many other dev servers that squat on 3000.
      //"*"
      "http://localhost:4001",
      "http://127.0.0.1:4001",
      ...env.OBSERVATORY_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? []
    ],
    databaseFile: env.OBSERVATORY_DB
  };
}
var DEFAULT_PORT;
var init_config = __esm({
  "apps/server/dist/config.js"() {
    "use strict";
    DEFAULT_PORT = 4e3;
  }
});

// apps/server/dist/db/schema.js
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
var sessions, events, metrics, signals, schema;
var init_schema = __esm({
  "apps/server/dist/db/schema.js"() {
    "use strict";
    sessions = sqliteTable("sessions", {
      id: text("id").primaryKey(),
      source: text("source").notNull(),
      model: text("model"),
      goal: text("goal"),
      /** JSON array of keywords for goal-drift detection (section 28). */
      goalKeywords: text("goal_keywords"),
      startedAt: text("started_at").notNull(),
      endedAt: text("ended_at"),
      status: text("status").notNull(),
      createdAt: text("created_at").notNull()
    }, (table) => [
      index("sessions_started_at_idx").on(table.startedAt),
      index("sessions_status_idx").on(table.status)
    ]);
    events = sqliteTable("events", {
      id: text("id").primaryKey(),
      sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
      timestamp: text("timestamp").notNull(),
      /**
       * Arrival order within the session.
       *
       * Timestamps collide constantly in real transcripts - several tool calls
       * inside one assistant turn share a timestamp to the millisecond. Ordering
       * by (timestamp, sequence) is therefore total and deterministic, which
       * correction-loop and repeated-failure detection depend on (sections 16, 17).
       */
      sequence: integer("sequence").notNull(),
      source: text("source").notNull(),
      type: text("type").notNull(),
      /** Normalized action identity, used by repetition detection (section 15). */
      signature: text("signature").notNull(),
      toolName: text("tool_name"),
      toolCommand: text("tool_command"),
      resultStatus: text("result_status"),
      /** `reported` or `inferred` - whether the status was stated or derived. */
      resultConfidence: text("result_confidence"),
      exitCode: integer("exit_code"),
      durationMs: integer("duration_ms"),
      tokensInput: integer("tokens_input"),
      tokensOutput: integer("tokens_output"),
      tokensCached: integer("tokens_cached"),
      filePath: text("file_path"),
      /** Redacted metadata as JSON, size-capped. Never raw transcript content. */
      payload: text("payload"),
      createdAt: text("created_at").notNull()
    }, (table) => [
      index("events_session_idx").on(table.sessionId),
      index("events_session_order_idx").on(table.sessionId, table.timestamp, table.sequence),
      index("events_session_sequence_idx").on(table.sessionId, table.sequence),
      index("events_timestamp_idx").on(table.timestamp),
      index("events_session_signature_idx").on(table.sessionId, table.signature),
      index("events_session_type_idx").on(table.sessionId, table.type)
    ]);
    metrics = sqliteTable("metrics", {
      id: text("id").primaryKey(),
      sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
      timestamp: text("timestamp").notNull(),
      healthScore: real("health_score"),
      learningScore: real("learning_score"),
      degradationScore: real("degradation_score"),
      successRate: real("success_rate"),
      errorRate: real("error_rate"),
      recoveryRate: real("recovery_rate"),
      repetitionRate: real("repetition_rate"),
      correctionLoopRate: real("correction_loop_rate"),
      toolEfficiency: real("tool_efficiency"),
      contextPressure: real("context_pressure"),
      createdAt: text("created_at").notNull()
    }, (table) => [
      index("metrics_session_idx").on(table.sessionId),
      index("metrics_session_timestamp_idx").on(table.sessionId, table.timestamp)
    ]);
    signals = sqliteTable("signals", {
      id: text("id").primaryKey(),
      sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
      timestamp: text("timestamp").notNull(),
      type: text("type").notNull(),
      severity: text("severity").notNull(),
      message: text("message").notNull(),
      /** JSON, redacted. */
      metadata: text("metadata"),
      createdAt: text("created_at").notNull()
    }, (table) => [
      index("signals_session_idx").on(table.sessionId),
      index("signals_session_timestamp_idx").on(table.sessionId, table.timestamp),
      index("signals_severity_idx").on(table.severity)
    ]);
    schema = { sessions, events, metrics, signals };
  }
});

// apps/server/dist/db/client.js
import { mkdirSync as mkdirSync2 } from "node:fs";
import { dirname as dirname3, resolve } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
function defaultMigrationsFolder() {
  return fileURLToPath2(new URL("../../../../database/migrations", import.meta.url));
}
function defaultDatabaseFile() {
  return fileURLToPath2(new URL("../../../../data/observatory.db", import.meta.url));
}
function createDatabase(options = {}) {
  const file = options.file ?? defaultDatabaseFile();
  if (file !== MEMORY) {
    mkdirSync2(dirname3(resolve(file)), { recursive: true });
  }
  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  if (file !== MEMORY) {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
  }
  const db = drizzle(sqlite, { schema });
  if (options.migrate !== false) {
    migrate(db, { migrationsFolder: options.migrationsFolder ?? defaultMigrationsFolder() });
  }
  return {
    db,
    sqlite,
    file,
    close() {
      sqlite.close();
    }
  };
}
var MEMORY;
var init_client = __esm({
  "apps/server/dist/db/client.js"() {
    "use strict";
    init_schema();
    MEMORY = ":memory:";
  }
});

// apps/server/dist/db/store.js
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid as nanoid2 } from "nanoid";
function encodeJson(value2, maxBytes) {
  if (value2 === void 0 || value2 === null)
    return null;
  const json = JSON.stringify(value2);
  if (json === void 0)
    return null;
  if (Buffer.byteLength(json, "utf8") <= maxBytes)
    return json;
  return JSON.stringify({ _truncated: true, _bytes: Buffer.byteLength(json, "utf8") });
}
function decodeJson(value2) {
  if (value2 === null)
    return null;
  try {
    const parsed = JSON.parse(value2);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function decodeKeywords(value2) {
  if (value2 === null)
    return null;
  try {
    const parsed = JSON.parse(value2);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : null;
  } catch {
    return null;
  }
}
function toSessionRecord(row) {
  return {
    id: row.id,
    source: row.source,
    model: row.model,
    goal: row.goal,
    goalKeywords: decodeKeywords(row.goalKeywords),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    status: row.status,
    createdAt: row.createdAt
  };
}
function toEvent(row) {
  const event = {
    id: row.id,
    sessionId: row.sessionId,
    timestamp: row.timestamp,
    source: row.source,
    type: row.type,
    signature: row.signature
  };
  if (row.toolName !== null) {
    event.tool = {
      name: row.toolName,
      ...row.toolCommand !== null ? { command: row.toolCommand } : {}
    };
  }
  if (row.resultStatus !== null || row.exitCode !== null || row.durationMs !== null || row.resultConfidence !== null) {
    event.result = {
      ...row.resultStatus !== null ? { status: row.resultStatus } : {},
      ...row.exitCode !== null ? { exitCode: row.exitCode } : {},
      ...row.durationMs !== null ? { durationMs: row.durationMs } : {},
      ...row.resultConfidence !== null ? { confidence: row.resultConfidence } : {}
    };
  }
  if (row.tokensInput !== null || row.tokensOutput !== null || row.tokensCached !== null) {
    event.tokens = {
      ...row.tokensInput !== null ? { input: row.tokensInput } : {},
      ...row.tokensOutput !== null ? { output: row.tokensOutput } : {},
      ...row.tokensCached !== null ? { cached: row.tokensCached } : {}
    };
  }
  if (row.filePath !== null) {
    event.files = { path: row.filePath };
  }
  const metadata = decodeJson(row.payload);
  if (metadata !== null) {
    event.metadata = metadata;
  }
  return event;
}
function toMetricsSnapshot2(row) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    timestamp: row.timestamp,
    healthScore: row.healthScore,
    learningScore: row.learningScore,
    degradationScore: row.degradationScore,
    successRate: row.successRate,
    errorRate: row.errorRate,
    recoveryRate: row.recoveryRate,
    repetitionRate: row.repetitionRate,
    correctionLoopRate: row.correctionLoopRate,
    toolEfficiency: row.toolEfficiency,
    contextPressure: row.contextPressure
  };
}
function toSignalRecord(row) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    timestamp: row.timestamp,
    type: row.type,
    severity: row.severity,
    message: row.message,
    metadata: decodeJson(row.metadata)
  };
}
function createStore(db, options = {}) {
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const newId = options.idFactory ?? (() => nanoid2());
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const timestamp = () => now().toISOString();
  const requireSession = (sessionId) => {
    const row = db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sessionId)).get();
    if (row === void 0)
      throw new UnknownSessionError(sessionId);
  };
  const nextSequence = (sessionId) => {
    const row = db.select({ value: sql`max(${events.sequence})` }).from(events).where(eq(events.sessionId, sessionId)).get();
    return (row?.value ?? 0) + 1;
  };
  const insertEvent = (sessionId, event, sequence) => {
    db.insert(events).values({
      id: event.id,
      sessionId,
      timestamp: event.timestamp,
      sequence,
      source: event.source,
      type: event.type,
      signature: event.signature,
      toolName: event.tool?.name ?? null,
      toolCommand: event.tool?.command ?? null,
      resultStatus: event.result?.status ?? null,
      resultConfidence: event.result?.confidence ?? null,
      exitCode: event.result?.exitCode ?? null,
      durationMs: event.result?.durationMs ?? null,
      tokensInput: event.tokens?.input ?? null,
      tokensOutput: event.tokens?.output ?? null,
      tokensCached: event.tokens?.cached ?? null,
      filePath: event.files?.path ?? null,
      payload: encodeJson(event.metadata, maxPayloadBytes),
      createdAt: timestamp()
    }).run();
  };
  const sessionStore = {
    create(input) {
      const parsed = sessionCreateSchema.parse(input);
      const createdAt = timestamp();
      const row = {
        id: parsed.id ?? newId(),
        source: parsed.source,
        model: parsed.model ?? null,
        goal: parsed.goal ?? null,
        goalKeywords: parsed.goalKeywords !== void 0 ? JSON.stringify(parsed.goalKeywords) : null,
        startedAt: parsed.startedAt ?? createdAt,
        endedAt: null,
        status: parsed.status ?? "active",
        createdAt
      };
      db.insert(sessions).values(row).run();
      return toSessionRecord(row);
    },
    get(id) {
      const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
      return row === void 0 ? void 0 : toSessionRecord(row);
    },
    list(listOptions = {}) {
      const query = db.select().from(sessions).$dynamic();
      const filtered = listOptions.status !== void 0 ? query.where(eq(sessions.status, listOptions.status)) : query;
      return filtered.orderBy(desc(sessions.startedAt), desc(sessions.createdAt)).limit(listOptions.limit ?? 100).offset(listOptions.offset ?? 0).all().map(toSessionRecord);
    },
    update(id, patch) {
      const parsed = sessionUpdateSchema.parse(patch);
      const changes = {};
      if (parsed.model !== void 0)
        changes.model = parsed.model;
      if (parsed.goal !== void 0)
        changes.goal = parsed.goal;
      if (parsed.goalKeywords !== void 0) {
        changes.goalKeywords = parsed.goalKeywords === null ? null : JSON.stringify(parsed.goalKeywords);
      }
      if (parsed.endedAt !== void 0)
        changes.endedAt = parsed.endedAt;
      if (parsed.status !== void 0)
        changes.status = parsed.status;
      if (Object.keys(changes).length > 0) {
        db.update(sessions).set(changes).where(eq(sessions.id, id)).run();
      }
      return sessionStore.get(id);
    },
    end(id, status = "completed") {
      const existing = sessionStore.get(id);
      if (existing === void 0)
        return void 0;
      if (existing.endedAt !== null)
        return existing;
      return sessionStore.update(id, { status, endedAt: timestamp() });
    },
    remove(id) {
      const result = db.delete(sessions).where(eq(sessions.id, id)).run();
      return result.changes > 0;
    },
    count() {
      const row = db.select({ value: sql`count(*)` }).from(sessions).get();
      return row?.value ?? 0;
    }
  };
  const eventStore = {
    append(sessionId, event) {
      requireSession(sessionId);
      const stored = { ...event, sessionId };
      insertEvent(sessionId, stored, nextSequence(sessionId));
      return stored;
    },
    appendMany(sessionId, batch) {
      if (batch.length === 0)
        return [];
      requireSession(sessionId);
      return db.transaction((tx) => {
        const row = tx.select({ value: sql`max(${events.sequence})` }).from(events).where(eq(events.sessionId, sessionId)).get();
        let sequence = (row?.value ?? 0) + 1;
        const stored = [];
        for (const event of batch) {
          const withSession = { ...event, sessionId };
          tx.insert(events).values({
            id: withSession.id,
            sessionId,
            timestamp: withSession.timestamp,
            sequence,
            source: withSession.source,
            type: withSession.type,
            signature: withSession.signature,
            toolName: withSession.tool?.name ?? null,
            toolCommand: withSession.tool?.command ?? null,
            resultStatus: withSession.result?.status ?? null,
            resultConfidence: withSession.result?.confidence ?? null,
            exitCode: withSession.result?.exitCode ?? null,
            durationMs: withSession.result?.durationMs ?? null,
            tokensInput: withSession.tokens?.input ?? null,
            tokensOutput: withSession.tokens?.output ?? null,
            tokensCached: withSession.tokens?.cached ?? null,
            filePath: withSession.files?.path ?? null,
            payload: encodeJson(withSession.metadata, maxPayloadBytes),
            createdAt: timestamp()
          }).run();
          stored.push(withSession);
          sequence += 1;
        }
        return stored;
      });
    },
    list(sessionId, listOptions = {}) {
      const conditions = listOptions.types !== void 0 && listOptions.types.length > 0 ? and(eq(events.sessionId, sessionId), inArray(events.type, [...listOptions.types])) : eq(events.sessionId, sessionId);
      return db.select().from(events).where(conditions).orderBy(asc(events.timestamp), asc(events.sequence)).limit(listOptions.limit ?? 1e3).offset(listOptions.offset ?? 0).all().map(toEvent);
    },
    get(id) {
      const row = db.select().from(events).where(eq(events.id, id)).get();
      return row === void 0 ? void 0 : toEvent(row);
    },
    count(sessionId) {
      const row = db.select({ value: sql`count(*)` }).from(events).where(eq(events.sessionId, sessionId)).get();
      return row?.value ?? 0;
    }
  };
  const metricsStore = {
    insert(input) {
      const parsed = metricsSnapshotCreateSchema.parse(input);
      requireSession(parsed.sessionId);
      const row = {
        id: parsed.id ?? newId(),
        sessionId: parsed.sessionId,
        timestamp: parsed.timestamp ?? timestamp(),
        healthScore: parsed.healthScore ?? null,
        learningScore: parsed.learningScore ?? null,
        degradationScore: parsed.degradationScore ?? null,
        successRate: parsed.successRate ?? null,
        errorRate: parsed.errorRate ?? null,
        recoveryRate: parsed.recoveryRate ?? null,
        repetitionRate: parsed.repetitionRate ?? null,
        correctionLoopRate: parsed.correctionLoopRate ?? null,
        toolEfficiency: parsed.toolEfficiency ?? null,
        contextPressure: parsed.contextPressure ?? null,
        createdAt: timestamp()
      };
      db.insert(metrics).values(row).run();
      return toMetricsSnapshot2(row);
    },
    latest(sessionId) {
      const row = db.select().from(metrics).where(eq(metrics.sessionId, sessionId)).orderBy(desc(metrics.timestamp), desc(metrics.createdAt)).limit(1).get();
      return row === void 0 ? void 0 : toMetricsSnapshot2(row);
    },
    history(sessionId, limit = 500) {
      return db.select().from(metrics).where(eq(metrics.sessionId, sessionId)).orderBy(asc(metrics.timestamp), asc(metrics.createdAt)).limit(limit).all().map(toMetricsSnapshot2);
    }
  };
  const signalStore = {
    insert(input) {
      const parsed = signalCreateSchema.parse(input);
      requireSession(parsed.sessionId);
      const row = {
        id: parsed.id ?? newId(),
        sessionId: parsed.sessionId,
        timestamp: parsed.timestamp ?? timestamp(),
        type: parsed.type,
        severity: parsed.severity,
        message: parsed.message,
        metadata: encodeJson(parsed.metadata, maxPayloadBytes),
        createdAt: timestamp()
      };
      db.insert(signals).values(row).run();
      return toSignalRecord(row);
    },
    list(sessionId, limit = 200) {
      return db.select().from(signals).where(eq(signals.sessionId, sessionId)).orderBy(asc(signals.timestamp), asc(signals.createdAt)).limit(limit).all().map(toSignalRecord);
    },
    latest(sessionId) {
      const row = db.select().from(signals).where(eq(signals.sessionId, sessionId)).orderBy(desc(signals.timestamp), desc(signals.createdAt)).limit(1).get();
      return row === void 0 ? void 0 : toSignalRecord(row);
    }
  };
  return {
    sessions: sessionStore,
    events: eventStore,
    metrics: metricsStore,
    signals: signalStore
  };
}
var DEFAULT_MAX_PAYLOAD_BYTES, UnknownSessionError;
var init_store = __esm({
  "apps/server/dist/db/store.js"() {
    "use strict";
    init_dist();
    init_schema();
    DEFAULT_MAX_PAYLOAD_BYTES = 4096;
    UnknownSessionError = class extends Error {
      sessionId;
      constructor(sessionId) {
        super(`Unknown session: ${sessionId}`);
        this.sessionId = sessionId;
        this.name = "UnknownSessionError";
      }
    };
  }
});

// apps/server/dist/hub.js
function createHub() {
  const bySession = /* @__PURE__ */ new Map();
  const send = (subscriber, message) => {
    if (subscriber.readyState !== void 0 && subscriber.readyState !== OPEN)
      return;
    try {
      subscriber.send(JSON.stringify(message));
    } catch {
    }
  };
  return {
    subscribe(sessionId, subscriber) {
      const existing = bySession.get(sessionId);
      if (existing === void 0) {
        bySession.set(sessionId, /* @__PURE__ */ new Set([subscriber]));
      } else {
        existing.add(subscriber);
      }
      return () => {
        const set = bySession.get(sessionId);
        if (set === void 0)
          return;
        set.delete(subscriber);
        if (set.size === 0)
          bySession.delete(sessionId);
      };
    },
    broadcast(sessionId, message) {
      const subscribers = bySession.get(sessionId);
      if (subscribers === void 0)
        return 0;
      let delivered = 0;
      for (const subscriber of subscribers) {
        send(subscriber, message);
        delivered += 1;
      }
      return delivered;
    },
    send,
    subscriberCount(sessionId) {
      if (sessionId !== void 0)
        return bySession.get(sessionId)?.size ?? 0;
      let total = 0;
      for (const set of bySession.values())
        total += set.size;
      return total;
    },
    clear() {
      bySession.clear();
    }
  };
}
var OPEN;
var init_hub = __esm({
  "apps/server/dist/hub.js"() {
    "use strict";
    OPEN = 1;
  }
});

// apps/server/dist/snapshot.js
function fileLabel(path) {
  if (path === void 0)
    return "a file";
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}
function toTimelineEntry(event, lastCommand) {
  const base = { id: event.id, at: event.timestamp };
  switch (event.type) {
    case "session_started":
      return { ...base, kind: "start", label: "Session started", detail: null };
    case "user_message":
      return { ...base, kind: "prompt", label: "Prompt received", detail: null };
    case "file_read":
      return {
        ...base,
        kind: "read",
        label: `Read ${fileLabel(event.files?.path)}`,
        detail: event.files?.path ?? null
      };
    case "file_edit":
    case "file_write":
      return {
        ...base,
        kind: "edit",
        label: `Edit ${fileLabel(event.files?.path)}`,
        detail: event.files?.path ?? null
      };
    case "tool_call":
    case "command_started":
    case "test_started":
      return {
        ...base,
        kind: "run",
        label: event.tool?.command ?? event.tool?.name ?? "a command",
        detail: null
      };
    case "tool_result":
    case "command_finished":
    case "test_finished": {
      const failed = isFailure(event);
      if (!failed && !isSuccess(event))
        return null;
      return {
        ...base,
        kind: failed ? "fail" : "pass",
        label: failed ? "Failed" : "Passed",
        detail: event.tool?.command ?? lastCommand
      };
    }
    case "error":
      return { ...base, kind: "fail", label: "Error", detail: event.tool?.name ?? null };
    case "session_ended":
      return { ...base, kind: "end", label: "Session ended", detail: null };
    default:
      return null;
  }
}
function buildTimeline(events2) {
  const entries = [];
  let lastCommand = "a command";
  for (const event of events2) {
    if (event.type === "tool_call" || event.type === "command_started") {
      lastCommand = event.tool?.command ?? event.tool?.name ?? lastCommand;
    }
    const entry = toTimelineEntry(event, lastCommand);
    if (entry !== null)
      entries.push(entry);
  }
  return entries;
}
function buildTrend(events2, goal, contextWindow) {
  const actionIndices = [];
  events2.forEach((event, index2) => {
    if (isActionEvent(event))
      actionIndices.push(index2);
  });
  if (actionIndices.length === 0)
    return [];
  const detector = goal === null ? null : createKeywordGoalDriftDetector();
  const points = [];
  const checkpoints = Math.min(CHECKPOINTS, actionIndices.length);
  for (let checkpoint = 1; checkpoint <= checkpoints; checkpoint += 1) {
    const actionCount = Math.max(1, Math.round(checkpoint / checkpoints * actionIndices.length));
    const lastAction = actionIndices[actionCount - 1] ?? 0;
    const slice = checkpoint === checkpoints ? events2 : events2.slice(0, lastAction + 2);
    const window = measureWindow(slice, `t${checkpoint}`, 0, slice.length - 1);
    const context = contextWindow === null ? null : computeContextUsage(slice, { reportedMaximum: contextWindow });
    const health = computeHealth({
      recoveryRate: window.recoveryRate,
      toolEfficiency: window.toolEfficiency,
      repetitionRate: window.repetitionRate,
      goalAdherence: detector === null || goal === null ? null : detector.measureAdherence(slice, { text: goal.text, keywords: goal.keywords }),
      contextPressure: context?.utilization ?? null
    });
    points.push({
      index: checkpoint,
      actions: actionCount,
      health: health.score,
      successRate: window.successRate,
      recoveryRate: window.recoveryRate
    });
  }
  return points;
}
function isSimulated(events2) {
  return events2[0]?.metadata?.["simulated"] === true;
}
function reportedContextWindow(events2) {
  for (const event of events2) {
    const value2 = event.metadata?.["contextWindow"];
    if (typeof value2 === "number" && value2 > 0)
      return value2;
  }
  return null;
}
function buildDetail(events2) {
  let title = null;
  let added = null;
  let removed = null;
  let thinking = null;
  let cacheRead = null;
  let cacheCreation = null;
  let timedOut = 0;
  const add = (total, value2) => typeof value2 === "number" && Number.isFinite(value2) ? (total ?? 0) + value2 : total;
  for (const event of events2) {
    const meta = event.metadata;
    if (meta === null || meta === void 0)
      continue;
    if (typeof meta["title"] === "string" && meta["title"].length > 0)
      title = meta["title"];
    added = add(added, meta["linesAdded"]);
    removed = add(removed, meta["linesRemoved"]);
    thinking = add(thinking, meta["thinkingTokens"]);
    cacheRead = add(cacheRead, meta["cacheRead"]);
    cacheCreation = add(cacheCreation, meta["cacheCreation"]);
    if (meta["timedOut"] === true)
      timedOut += 1;
  }
  const cacheTotal = (cacheRead ?? 0) + (cacheCreation ?? 0);
  const cacheHitRate = cacheTotal > 0 ? (cacheRead ?? 0) / cacheTotal : null;
  return {
    title,
    linesAdded: added,
    linesRemoved: removed,
    thinkingTokens: thinking,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
    cacheHitRate,
    timedOutCommands: timedOut
  };
}
function analyzeStoredSession(store, sessionId) {
  const record = store.sessions.get(sessionId);
  if (record === void 0)
    return void 0;
  const events2 = store.events.list(sessionId, { limit: EVENT_LIMIT });
  const contextWindow = reportedContextWindow(events2);
  const goal = record.goal === null && (record.goalKeywords === null || record.goalKeywords.length === 0) ? void 0 : { text: record.goal, keywords: record.goalKeywords ?? [] };
  const analysis = analyzeSession(events2, {
    ...goal !== void 0 ? { goal } : {},
    metrics: { context: { reportedMaximum: contextWindow } }
  });
  return { record, events: events2, analysis, contextWindow, simulated: isSimulated(events2) };
}
function buildSnapshot(analyzed, options = {}) {
  const { record, events: events2, analysis } = analyzed;
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const goal = record.goal === null && (record.goalKeywords === null || record.goalKeywords.length === 0) ? null : { text: record.goal, keywords: record.goalKeywords ?? [] };
  const timeline = buildTimeline(events2);
  return {
    session: {
      id: record.id,
      source: record.source,
      model: record.model,
      goal: record.goal,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      status: record.status,
      durationMs: analysis.metrics.durationMs,
      eventCount: events2.length,
      simulated: analyzed.simulated,
      contextWindow: analyzed.contextWindow
    },
    detail: buildDetail(events2),
    scores: {
      health: analysis.health.score,
      healthState: analysis.health.state,
      healthComponents: analysis.health.components.map((component) => ({
        name: HEALTH_COMPONENT_LABELS[component.name] ?? component.name,
        value: component.value,
        weight: component.effectiveWeight
      })),
      measuredComponents: analysis.health.measuredComponents,
      learning: analysis.learning.score,
      state: analysis.currentState,
      learningDelta: analysis.learning.weightedImprovement,
      degradation: analysis.degradation.score
    },
    metrics: analysis.metrics,
    windows: analysis.windows.windows.map((window) => ({
      label: window.label,
      actions: window.actions,
      errorRate: window.errorRate,
      recoveryRate: window.recoveryRate,
      repetitionRate: window.repetitionRate,
      goalAdherence: window.goalAdherence
    })),
    trend: buildTrend(events2, goal, analyzed.contextWindow),
    reasons: analysis.reasons,
    signals: signalsFor(record.id, analysis).map((signal) => ({
      type: signal.type,
      severity: signal.severity,
      message: signal.message
    })).slice(0, 10),
    timeline: timeline.slice(-TIMELINE_LIMIT),
    computedAt: now().toISOString()
  };
}
function buildSummary(analyzed) {
  const { record, analysis } = analyzed;
  return {
    id: record.id,
    source: record.source,
    model: record.model,
    goal: record.goal,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    status: record.status,
    simulated: analyzed.simulated,
    eventCount: analyzed.events.length,
    health: analysis.health.score,
    learning: analysis.learning.score,
    state: analysis.currentState
  };
}
var CHECKPOINTS, TIMELINE_LIMIT, EVENT_LIMIT, HEALTH_COMPONENT_LABELS;
var init_snapshot = __esm({
  "apps/server/dist/snapshot.js"() {
    "use strict";
    init_dist4();
    init_dist3();
    init_dist();
    CHECKPOINTS = 14;
    TIMELINE_LIMIT = 60;
    EVENT_LIMIT = 5e3;
    HEALTH_COMPONENT_LABELS = {
      recovery: "Recovery",
      toolEfficiency: "Tool efficiency",
      repetitionAvoidance: "Repetition avoidance",
      goalAdherence: "Goal adherence",
      contextManagement: "Context headroom"
    };
  }
});

// apps/server/dist/compare.js
function pick(snapshot, metric) {
  switch (metric) {
    case "health":
      return snapshot.scores.health;
    case "learning":
      return snapshot.scores.learning;
    case "successRate":
      return snapshot.metrics.successRate;
    case "recoveryRate":
      return snapshot.metrics.recoveryRate;
    case "toolEfficiency":
      return snapshot.metrics.toolEfficiency;
    case "repetitionRate":
      return snapshot.metrics.repetitionRate;
    case "errorRate":
      return snapshot.metrics.errorRate;
    default:
      return null;
  }
}
function deltaOf(metric, left, right) {
  if (left === null || right === null) {
    return { metric, left, right, delta: null, better: null };
  }
  const delta = right - left;
  const lowerIsBetter = LOWER_IS_BETTER.includes(metric);
  return {
    metric,
    left,
    right,
    delta,
    better: delta === 0 ? null : lowerIsBetter ? delta < 0 : delta > 0
  };
}
function compareSessions(store, leftId, rightId) {
  const left = analyzeStoredSession(store, leftId);
  const right = analyzeStoredSession(store, rightId);
  if (left === void 0 || right === void 0)
    return void 0;
  const leftSnapshot = buildSnapshot(left);
  const rightSnapshot = buildSnapshot(right);
  const leftSignals = new Set(leftSnapshot.signals.map((signal) => signal.message));
  const rightSignals = new Set(rightSnapshot.signals.map((signal) => signal.message));
  return {
    left: leftSnapshot,
    right: rightSnapshot,
    deltas: DELTA_METRICS.map((metric) => deltaOf(metric, pick(leftSnapshot, metric), pick(rightSnapshot, metric))),
    onlyLeftSignals: [...leftSignals].filter((message) => !rightSignals.has(message)),
    onlyRightSignals: [...rightSignals].filter((message) => !leftSignals.has(message))
  };
}
function median(values) {
  const present = values.filter((value2) => value2 !== null).sort((a, b) => a - b);
  if (present.length === 0)
    return null;
  const middle = Math.floor(present.length / 2);
  return present.length % 2 === 1 ? present[middle] ?? null : ((present[middle - 1] ?? 0) + (present[middle] ?? 0)) / 2;
}
function groupKey(analyzed, groupBy) {
  switch (groupBy) {
    case "model":
      return analyzed.record.model;
    case "source":
      return analyzed.record.source;
    case "goal":
      return analyzed.record.goal;
  }
}
function compareGroups(store, groupBy, limit = 200) {
  const records = store.sessions.list({ limit });
  const buckets = /* @__PURE__ */ new Map();
  let ungrouped = 0;
  for (const record of records) {
    const analyzed = analyzeStoredSession(store, record.id);
    if (analyzed === void 0)
      continue;
    const key = groupKey(analyzed, groupBy);
    if (key === null || key === "") {
      ungrouped += 1;
      continue;
    }
    const bucket = buckets.get(key);
    if (bucket === void 0)
      buckets.set(key, [analyzed]);
    else
      bucket.push(analyzed);
  }
  const groups = [...buckets.entries()].map(([key, sessions2]) => {
    const states = {
      improving: 0,
      stable: 0,
      degrading: 0,
      insufficient_data: 0
    };
    for (const session of sessions2)
      states[session.analysis.currentState] += 1;
    return {
      key,
      sessions: sessions2.length,
      totalEvents: sessions2.reduce((total, session) => total + session.events.length, 0),
      health: median(sessions2.map((session) => session.analysis.health.score)),
      learning: median(sessions2.map((session) => session.analysis.learning.score)),
      successRate: median(sessions2.map((session) => session.analysis.metrics.successRate)),
      recoveryRate: median(sessions2.map((session) => session.analysis.metrics.recoveryRate)),
      repetitionRate: median(sessions2.map((session) => session.analysis.metrics.repetitionRate)),
      states
    };
  });
  groups.sort((a, b) => b.sessions - a.sessions || (b.health ?? -1) - (a.health ?? -1));
  return { groupBy, groups, ungrouped };
}
var DELTA_METRICS;
var init_compare2 = __esm({
  "apps/server/dist/compare.js"() {
    "use strict";
    init_dist();
    init_snapshot();
    DELTA_METRICS = [
      "health",
      "learning",
      "successRate",
      "errorRate",
      "recoveryRate",
      "repetitionRate",
      "toolEfficiency"
    ];
  }
});

// apps/server/dist/routes.js
import { nanoid as nanoid3 } from "nanoid";
import { z as z5 } from "zod";
function registerRoutes(app, options) {
  const { hub } = options;
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  let ingestSequence = 0;
  const nextId = () => options.idFactory === void 0 ? nanoid3() : options.idFactory(++ingestSequence);
  const snapshotFor = (sessionId) => {
    const analyzed = analyzeStoredSession(app.store, sessionId);
    return analyzed === void 0 ? void 0 : buildSnapshot(analyzed, { now });
  };
  app.post("/api/sessions", async (request2, reply) => {
    const parsed = sessionCreateSchema.safeParse(request2.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_session", issues: parsed.error.issues });
    }
    const record = app.store.sessions.create(parsed.data);
    return reply.code(201).send(record);
  });
  app.get("/api/sessions", async (request2, reply) => {
    const query = listQuerySchema.safeParse(request2.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ error: "invalid_query", issues: query.error.issues });
    }
    const records = app.store.sessions.list({
      limit: query.data.limit ?? 50,
      offset: query.data.offset ?? 0,
      ...query.data.status !== void 0 ? { status: query.data.status } : {}
    });
    const sessions2 = records.map((record) => analyzeStoredSession(app.store, record.id)).filter((analyzed) => analyzed !== void 0).map(buildSummary);
    return reply.send({ sessions: sessions2, count: sessions2.length });
  });
  app.get("/api/sessions/:id", async (request2, reply) => {
    const snapshot = snapshotFor(request2.params.id);
    if (snapshot === void 0)
      return reply.code(404).send({ error: "unknown_session" });
    return reply.send(snapshot);
  });
  app.patch("/api/sessions/:id", async (request2, reply) => {
    const parsed = sessionUpdateSchema.safeParse(request2.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_update", issues: parsed.error.issues });
    }
    const record = app.store.sessions.update(request2.params.id, parsed.data);
    if (record === void 0)
      return reply.code(404).send({ error: "unknown_session" });
    if (record.endedAt !== null) {
      hub.broadcast(record.id, { type: "session_ended", sessionId: record.id });
    }
    const snapshot = snapshotFor(record.id);
    if (snapshot !== void 0) {
      hub.broadcast(record.id, { type: "snapshot", sessionId: record.id, snapshot });
    }
    return reply.send(record);
  });
  app.post("/api/sessions/:id/events", async (request2, reply) => {
    const sessionId = request2.params.id;
    const session = app.store.sessions.get(sessionId);
    if (session === void 0)
      return reply.code(404).send({ error: "unknown_session" });
    const parsed = eventBatchSchema.safeParse(request2.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_event", issues: parsed.error.issues });
    }
    const inputs = Array.isArray(parsed.data) ? parsed.data : "events" in parsed.data ? parsed.data.events : [parsed.data];
    const accepted = [];
    let redactions = 0;
    try {
      for (const input of inputs) {
        const normalized = normalizeEvent(input, {
          sessionId,
          id: nextId(),
          timestamp: now().toISOString()
        });
        const { value: value2, redactions: hits } = redactEvent(normalized);
        redactions += hits.reduce((total, hit) => total + hit.count, 0);
        accepted.push(value2);
      }
    } catch (error) {
      if (error instanceof EventValidationError) {
        return reply.code(400).send({ error: "invalid_event", message: error.message });
      }
      throw error;
    }
    const stored = app.store.events.appendMany(sessionId, accepted);
    const snapshot = snapshotFor(sessionId);
    if (snapshot !== void 0) {
      let lastCommand = "a command";
      for (const event of stored) {
        if (event.type === "tool_call" || event.type === "command_started") {
          lastCommand = event.tool?.command ?? event.tool?.name ?? lastCommand;
        }
        const entry = toTimelineEntry(event, lastCommand);
        if (entry !== null)
          hub.broadcast(sessionId, { type: "event", sessionId, entry });
      }
      hub.broadcast(sessionId, { type: "snapshot", sessionId, snapshot });
    }
    return reply.code(202).send({
      accepted: stored.length,
      redactions,
      eventIds: stored.map((event) => event.id)
    });
  });
  app.get("/api/sessions/:id/metrics", async (request2, reply) => {
    const snapshot = snapshotFor(request2.params.id);
    if (snapshot === void 0)
      return reply.code(404).send({ error: "unknown_session" });
    return reply.send({
      sessionId: request2.params.id,
      metrics: snapshot.metrics,
      windows: snapshot.windows,
      trend: snapshot.trend
    });
  });
  app.get("/api/sessions/:id/health", async (request2, reply) => {
    const snapshot = snapshotFor(request2.params.id);
    if (snapshot === void 0)
      return reply.code(404).send({ error: "unknown_session" });
    return reply.send({
      sessionId: request2.params.id,
      ...snapshot.scores,
      reasons: snapshot.reasons,
      signals: snapshot.signals
    });
  });
  app.get("/api/sessions/:id/timeline", async (request2, reply) => {
    const snapshot = snapshotFor(request2.params.id);
    if (snapshot === void 0)
      return reply.code(404).send({ error: "unknown_session" });
    return reply.send({ sessionId: request2.params.id, timeline: snapshot.timeline });
  });
  app.get("/api/sessions/:id/events", async (request2, reply) => {
    const session = app.store.sessions.get(request2.params.id);
    if (session === void 0)
      return reply.code(404).send({ error: "unknown_session" });
    const query = listQuerySchema.safeParse(request2.query ?? {});
    const events2 = app.store.events.list(request2.params.id, {
      limit: query.success ? query.data.limit ?? 500 : 500,
      offset: query.success ? query.data.offset ?? 0 : 0
    });
    return reply.send({ sessionId: request2.params.id, events: events2, count: events2.length });
  });
  app.get("/api/compare", async (request2, reply) => {
    const query = compareQuerySchema.safeParse(request2.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ error: "invalid_query", issues: query.error.issues });
    }
    if (query.data.by !== void 0) {
      return reply.send(compareGroups(app.store, query.data.by));
    }
    if (query.data.left === void 0 || query.data.right === void 0) {
      return reply.code(400).send({ error: "invalid_query", message: "pass either by=, or both left= and right=" });
    }
    const comparison = compareSessions(app.store, query.data.left, query.data.right);
    if (comparison === void 0)
      return reply.code(404).send({ error: "unknown_session" });
    return reply.send(comparison);
  });
  app.get("/api/sessions/:id/stream", { websocket: true }, (socket, request2) => {
    const sessionId = request2.params.id;
    const snapshot = snapshotFor(sessionId);
    if (snapshot === void 0) {
      hub.send(socket, { type: "error", message: `unknown session: ${sessionId}` });
      socket.close();
      return;
    }
    hub.send(socket, { type: "hello", sessionId, snapshot });
    const unsubscribe = hub.subscribe(sessionId, socket);
    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });
}
var eventBatchSchema, compareQuerySchema, listQuerySchema;
var init_routes = __esm({
  "apps/server/dist/routes.js"() {
    "use strict";
    init_dist();
    init_dist2();
    init_compare2();
    init_snapshot();
    eventBatchSchema = z5.union([
      agentEventInputSchema,
      z5.object({ events: z5.array(agentEventInputSchema).min(1).max(1e3) }),
      z5.array(agentEventInputSchema).min(1).max(1e3)
    ]);
    compareQuerySchema = z5.object({
      left: z5.string().min(1).optional(),
      right: z5.string().min(1).optional(),
      by: z5.enum(["model", "goal", "source"]).optional()
    });
    listQuerySchema = z5.object({
      limit: z5.coerce.number().int().min(1).max(500).optional(),
      offset: z5.coerce.number().int().min(0).optional(),
      status: z5.enum(["active", "completed", "aborted"]).optional()
    });
  }
});

// apps/server/dist/app.js
import { existsSync as existsSync2 } from "node:fs";
import { join as join3 } from "node:path";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, {} from "fastify";
function registerDashboard(app, root) {
  app.register(fastifyStatic, { root, wildcard: false });
  app.setNotFoundHandler((request2, reply) => {
    if (request2.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "not_found" });
    }
    const path = (request2.url.split("?")[0] ?? "/").replace(/^\/+|\/+$/gu, "");
    const candidate = `${path}.html`;
    if (path !== "" && !path.includes("..") && existsSync2(join3(root, candidate))) {
      return reply.sendFile(candidate);
    }
    return reply.sendFile("index.html");
  });
}
function createApp(options = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    logger: options.logger ?? false,
    // Telemetry payloads are small; keep an explicit ceiling so a runaway
    // collector cannot exhaust memory (section 49).
    bodyLimit: 4 * 1024 * 1024
  });
  const ownsDatabase = options.database === void 0;
  const database = options.database ?? createDatabase({
    file: config.databaseFile,
    ...options.migrationsFolder !== void 0 ? { migrationsFolder: options.migrationsFolder } : {}
  });
  const hub = createHub();
  app.decorate("database", database);
  app.decorate("store", createStore(database.db));
  app.decorate("hub", hub);
  if (ownsDatabase) {
    app.addHook("onClose", () => {
      database.close();
    });
  }
  app.register(cors, { origin: [...config.allowedOrigins] });
  app.register(websocket);
  if (options.dashboardDir !== void 0) {
    registerDashboard(app, options.dashboardDir);
  }
  app.register(async (instance) => {
    registerRoutes(instance, { hub, ...options.now !== void 0 ? { now: options.now } : {} });
  });
  app.get("/api/health", async () => {
    return {
      status: "ok",
      version: OBSERVATORY_VERSION,
      contractVersion: CONTRACT_VERSION,
      time: (/* @__PURE__ */ new Date()).toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        location: database.file === ":memory:" ? "memory" : database.file,
        sessions: app.store.sessions.count()
      },
      subscribers: hub.subscriberCount()
    };
  });
  return app;
}
var init_app = __esm({
  "apps/server/dist/app.js"() {
    "use strict";
    init_dist();
    init_config();
    init_client();
    init_store();
    init_hub();
    init_routes();
  }
});

// apps/server/dist/start.js
function isAddressInUse(error) {
  return typeof error === "object" && error !== null && "code" in error ? error.code === "EADDRINUSE" : false;
}
async function startServer(options = {}) {
  const base = options.config ?? loadConfig();
  const config = {
    ...base,
    ...options.host !== void 0 ? { host: options.host } : {},
    ...options.port !== void 0 ? { port: options.port } : {}
  };
  const app = createApp({ ...options, config });
  const url = `http://${config.host}:${config.port}`;
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    await app.close();
    if (isAddressInUse(error))
      throw new PortInUseError(url);
    throw error;
  }
  return {
    app,
    url,
    config,
    close: async () => {
      await app.close();
    }
  };
}
var PortInUseError;
var init_start = __esm({
  "apps/server/dist/start.js"() {
    "use strict";
    init_app();
    init_config();
    PortInUseError = class extends Error {
      url;
      constructor(url) {
        super(`Something is already listening on ${url}.
That is probably an Observatory server you already started - check with \`observatory status\`.
To run a second one, pass --port or set OBSERVATORY_PORT.`);
        this.url = url;
        this.name = "PortInUseError";
      }
    };
  }
});

// apps/server/dist/api.js
var api_exports = {};
__export(api_exports, {
  PortInUseError: () => PortInUseError,
  compareGroups: () => compareGroups,
  compareSessions: () => compareSessions,
  createApp: () => createApp,
  createDatabase: () => createDatabase,
  createStore: () => createStore,
  loadConfig: () => loadConfig,
  startServer: () => startServer
});
var init_api = __esm({
  "apps/server/dist/api.js"() {
    "use strict";
    init_app();
    init_config();
    init_start();
    init_client();
    init_store();
    init_compare2();
  }
});

// cli/src/api.ts
var DEFAULT_SERVER = "http://127.0.0.1:4000";
var ApiError = class extends Error {
  constructor(status, url, message) {
    super(message);
    this.status = status;
    this.url = url;
    this.name = "ApiError";
  }
  status;
  url;
};
var ServerUnreachableError = class extends Error {
  constructor(server) {
    super(
      `Cannot reach the Observatory API at ${server}.
Start it with \`npm run dev\` (or \`npm run dev:server\`) and try again.`
    );
    this.server = server;
    this.name = "ServerUnreachableError";
  }
  server;
};
async function request(server, path, init) {
  const url = `${server.replace(/\/$/u, "")}${path}`;
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers }
    });
  } catch {
    throw new ServerUnreachableError(server);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ApiError(response.status, url, `${response.status} ${response.statusText} ${detail}`);
  }
  return await response.json();
}
function createApiClient(server = DEFAULT_SERVER) {
  return {
    server,
    health() {
      return request(server, "/api/health");
    },
    createSession(input) {
      return request(server, "/api/sessions", { method: "POST", body: JSON.stringify(input) });
    },
    getSession(sessionId) {
      return request(server, `/api/sessions/${encodeURIComponent(sessionId)}`);
    },
    sendEvent(sessionId, event) {
      return request(server, `/api/sessions/${encodeURIComponent(sessionId)}/events`, {
        method: "POST",
        body: JSON.stringify(event)
      });
    },
    sendEvents(sessionId, events2) {
      return request(server, `/api/sessions/${encodeURIComponent(sessionId)}/events`, {
        method: "POST",
        body: JSON.stringify({ events: events2 })
      });
    },
    listSessions() {
      return request(server, "/api/sessions?limit=25");
    },
    compareSessions(left, right) {
      return request(
        server,
        `/api/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`
      );
    },
    compareGroups(by) {
      return request(server, `/api/compare?by=${encodeURIComponent(by)}`);
    },
    endSession(sessionId) {
      return request(server, `/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed", endedAt: (/* @__PURE__ */ new Date()).toISOString() })
      });
    }
  };
}

// packages/collectors/dist/demo.js
var DEMO_SCENARIOS = ["improving", "stable", "degrading"];
function isDemoScenario(value2) {
  return DEMO_SCENARIOS.includes(value2);
}
var ACTIONS_PER_PHASE = 12;
var PHASE_LABELS = ["early", "middle", "recent"];
var DEFAULT_SEED = "observatory";
var DEFAULT_MODEL = "claude-opus-5";
var DEFAULT_CONTEXT_WINDOW = 2e5;
var DEFAULT_DEMO_START = "2026-09-03T13:02:00.000Z";
var GOAL_TEXT = "Fix the failing auth token refresh tests";
var GOAL_KEYWORDS = ["auth", "token", "refresh", "session"];
var RELATED_FILES = [
  "src/auth/token-refresh.ts",
  "src/auth/session-store.ts",
  "tests/auth/token-refresh.test.ts",
  "src/auth/client.ts",
  "src/auth/middleware.ts",
  "tests/auth/session-store.test.ts",
  "src/auth/refresh-queue.ts",
  "src/auth/token-store.ts",
  "tests/auth/client.test.ts"
];
var UNRELATED_FILES = [
  "src/ui/settings-panel.tsx",
  "docs/CHANGELOG.md",
  "src/lib/date-format.ts",
  "src/ui/theme.ts"
];
var RELATED_COMMANDS = [
  "npm test -- auth",
  "npx vitest run tests/auth/token-refresh.test.ts",
  "npm run test:unit -- token-refresh",
  "npx vitest run tests/auth/session-store.test.ts",
  "npm test -- session",
  "npm run test:integration -- auth"
];
var NEUTRAL_COMMANDS = ["npm run typecheck", "npm run lint", "npm run build"];
var INSPECTION_COMMANDS = ["git diff --stat", "git status --short"];
var read = (slot) => ({ act: "read", slot });
var edit = (slot) => ({ act: "edit", slot });
var pass = (slot) => ({ act: "run", slot, ok: true });
var fail = (slot) => ({ act: "run", slot, ok: false });
var IMPROVING = {
  headline: "an agent that starts by thrashing, works out the problem, and converges",
  narrative: [
    "blind retry of a failing test, then two unresolved failures",
    "investigates, edits, and recovers from every failure",
    "one hiccup, immediately corrected; mostly first-time passes"
  ],
  contextStart: 0.11,
  contextPeak: 0.38,
  phases: [
    [
      read("f0"),
      fail("t0"),
      fail("t0"),
      // retried with nothing changed in between - a blind retry
      read("f1"),
      edit("f0"),
      fail("n0"),
      read("f0"),
      edit("f0"),
      read("f1"),
      pass("g0"),
      read("f2"),
      pass("n1")
    ],
    [
      read("f3"),
      edit("f0"),
      pass("t0"),
      // the edit above closes the episode opened in the early phase
      fail("t1"),
      read("f1"),
      edit("f1"),
      pass("t1"),
      // failure -> investigation -> edit -> retry -> pass
      fail("n0"),
      read("f2"),
      edit("f2"),
      pass("n0"),
      pass("t2")
    ],
    [
      read("f4"),
      edit("f3"),
      pass("t0"),
      pass("t2"),
      read("f5"),
      edit("f4"),
      // A command that has not failed before, so the session's worst run of
      // consecutive failures stays at two and the improving example never
      // raises a critical repeated-failure signal about itself.
      fail("t4"),
      read("f2"),
      edit("f4"),
      pass("t4"),
      pass("n0"),
      pass("n1")
    ]
  ]
};
var STABLE_PHASE = (a, b, c, ca, cb, cn) => [
  read(a),
  edit(a),
  pass(ca),
  read(b),
  fail(cb),
  read(b),
  edit(b),
  pass(cb),
  read(c),
  edit(c),
  pass(cn),
  pass(ca)
];
var STABLE = {
  headline: "an agent working steadily: one failure per stretch, corrected each time",
  narrative: [
    "one failed check, investigated and fixed",
    "same rhythm on a different part of the code",
    "same rhythm again - no trend in either direction"
  ],
  contextStart: 0.18,
  contextPeak: 0.55,
  phases: [
    STABLE_PHASE("f0", "f1", "f2", "t0", "t1", "n0"),
    STABLE_PHASE("f3", "f4", "f5", "t2", "t3", "n1"),
    STABLE_PHASE("f6", "f7", "f8", "t4", "t5", "n2")
  ]
};
var DEGRADING = {
  headline: "an agent that starts well, gets stuck, and never recovers",
  narrative: [
    "competent: one failure, corrected on the next attempt",
    "the same test fails four times; edits stop helping",
    "still failing, now editing files unrelated to the goal"
  ],
  contextStart: 0.21,
  contextPeak: 0.94,
  phases: [
    [
      read("f0"),
      edit("f0"),
      pass("t0"),
      read("f1"),
      fail("n0"),
      edit("f1"),
      pass("n0"),
      read("f2"),
      edit("f2"),
      pass("t0"),
      read("f3"),
      pass("n1")
    ],
    [
      fail("t1"),
      edit("f0"),
      fail("t1"),
      // edited, still failing: a failed correction loop
      read("f0"),
      fail("t1"),
      // read something, changed nothing, ran it again: a blind retry
      read("u0"),
      fail("n1"),
      edit("u0"),
      fail("n1"),
      read("f1"),
      fail("t1"),
      read("u1")
    ],
    [
      fail("t1"),
      read("u1"),
      fail("n1"),
      edit("u1"),
      fail("n1"),
      read("u2"),
      pass("g0"),
      read("u1"),
      fail("t1"),
      edit("u2"),
      fail("t1"),
      read("u0")
    ]
  ]
};
var SCRIPTS = {
  improving: IMPROVING,
  stable: STABLE,
  degrading: DEGRADING
};
function hashSeed(seed) {
  let hash = 2166136261;
  for (let index2 = 0; index2 < seed.length; index2 += 1) {
    hash ^= seed.charCodeAt(index2);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 >>> 0;
    let value2 = Math.imul(state ^ state >>> 15, 1 | state);
    value2 = value2 + Math.imul(value2 ^ value2 >>> 7, 61 | value2) ^ value2;
    return ((value2 ^ value2 >>> 14) >>> 0) / 4294967296;
  };
}
function rotate(pool, index2, offset) {
  const value2 = pool[(index2 + offset) % pool.length];
  if (value2 === void 0)
    throw new Error(`demo name pool is empty (index ${index2})`);
  return value2;
}
function resolveFile(slot, offsets) {
  const index2 = Number.parseInt(slot.slice(1), 10);
  return slot.startsWith("u") ? rotate(UNRELATED_FILES, index2, offsets.unrelatedFile) : rotate(RELATED_FILES, index2, offsets.relatedFile);
}
function resolveCommand(slot, offsets) {
  const index2 = Number.parseInt(slot.slice(1), 10);
  if (slot.startsWith("n"))
    return rotate(NEUTRAL_COMMANDS, index2, offsets.neutralCommand);
  if (slot.startsWith("g"))
    return rotate(INSPECTION_COMMANDS, index2, offsets.inspectionCommand);
  return rotate(RELATED_COMMANDS, index2, offsets.relatedCommand);
}
function generateDemoSession(options) {
  const script = SCRIPTS[options.scenario];
  const seed = String(options.seed ?? DEFAULT_SEED);
  const hash = hashSeed(`${options.scenario}:${seed}`);
  const random = mulberry32(hash);
  const offsets = {
    relatedFile: Math.floor(random() * RELATED_FILES.length),
    unrelatedFile: Math.floor(random() * UNRELATED_FILES.length),
    relatedCommand: Math.floor(random() * RELATED_COMMANDS.length),
    neutralCommand: Math.floor(random() * NEUTRAL_COMMANDS.length),
    inspectionCommand: Math.floor(random() * INSPECTION_COMMANDS.length)
  };
  const source = options.source ?? "claude_code";
  const model = options.model ?? DEFAULT_MODEL;
  const contextWindow = options.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const sessionId = options.sessionId ?? `demo_${options.scenario}_${hash.toString(16).toUpperCase().padStart(8, "0").slice(0, 4)}`;
  const startedAt = options.startedAt ?? DEFAULT_DEMO_START;
  let cursor = Date.parse(startedAt);
  if (Number.isNaN(cursor)) {
    throw new Error(`generateDemoSession: startedAt is not a valid ISO timestamp: ${startedAt}`);
  }
  const events2 = [];
  let callSequence = 0;
  let turn = 0;
  const ACTIONS_PER_TURN = 4;
  const turns = ACTIONS_PER_PHASE * 3 / ACTIONS_PER_TURN;
  const gap = (minMs, maxMs) => minMs + Math.floor(random() * (maxMs - minMs + 1));
  const advance = (minMs, maxMs) => {
    cursor += gap(minMs, maxMs);
    return new Date(cursor).toISOString();
  };
  const push = (event, timestamp, phase, extraMetadata = {}) => {
    events2.push({
      ...event,
      sessionId,
      source,
      timestamp,
      metadata: {
        ...event.metadata,
        ...extraMetadata,
        simulated: true,
        scenario: options.scenario,
        phase
      }
    });
  };
  push({ type: "session_started", metadata: { model, contextWindow, goal: GOAL_TEXT } }, new Date(cursor).toISOString(), PHASE_LABELS[0]);
  push({ type: "user_message" }, advance(400, 1200), PHASE_LABELS[0]);
  const succeeded = {
    status: "success",
    exitCode: 0,
    confidence: "reported"
  };
  script.phases.forEach((steps, phaseIndex) => {
    const phase = PHASE_LABELS[phaseIndex] ?? `phase_${phaseIndex + 1}`;
    steps.forEach((step, stepIndex) => {
      if (stepIndex % ACTIONS_PER_TURN === 0) {
        const progress = turns === 1 ? 1 : turn / (turns - 1);
        const live = Math.round(contextWindow * (script.contextStart + (script.contextPeak - script.contextStart) * progress));
        const cached = Math.round(live * 0.72);
        push({
          type: "model_response",
          tokens: { input: live - cached, output: gap(180, 900), cached }
        }, advance(900, 3e3), phase, { turn: turn + 1 });
        turn += 1;
      }
      if (step.act === "read") {
        push({
          type: "file_read",
          tool: { name: "Read" },
          files: { path: resolveFile(step.slot, offsets) },
          result: succeeded
        }, advance(700, 2400), phase);
        return;
      }
      if (step.act === "edit") {
        push({
          type: "file_edit",
          tool: { name: "Edit" },
          files: { path: resolveFile(step.slot, offsets) },
          result: succeeded
        }, advance(1500, 6e3), phase);
        return;
      }
      callSequence += 1;
      const callId = `call_${String(callSequence).padStart(3, "0")}`;
      const command = resolveCommand(step.slot, offsets);
      const durationMs = gap(1200, 9e3);
      push({ type: "tool_call", tool: { name: "Bash", command } }, advance(600, 2500), phase, {
        callId
      });
      push({
        type: "tool_result",
        tool: { name: "Bash", command },
        result: step.ok ? { ...succeeded, durationMs } : { status: "error", exitCode: 1, durationMs, confidence: "reported" }
      }, advance(durationMs, durationMs), phase, { callId });
    });
  });
  push({ type: "session_ended" }, advance(800, 2e3), PHASE_LABELS[2]);
  return {
    scenario: options.scenario,
    seed,
    sessionId,
    source,
    model,
    goal: GOAL_TEXT,
    goalKeywords: GOAL_KEYWORDS,
    startedAt,
    endedAt: new Date(cursor).toISOString(),
    contextWindow,
    headline: script.headline,
    narrative: script.narrative,
    simulated: true,
    events: events2
  };
}
var DEMO_ACTION_COUNT = ACTIONS_PER_PHASE * 3;

// packages/collectors/dist/claude-code.js
init_dist2();
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
var CLAUDE_CODE_HOME_DIR = ".claude";
var TOOL_EVENT_TYPES = {
  Read: "file_read",
  NotebookRead: "file_read",
  Write: "file_write",
  Edit: "file_edit",
  MultiEdit: "file_edit",
  NotebookEdit: "file_edit",
  Grep: "search",
  Glob: "search",
  WebSearch: "search",
  WebFetch: "search"
};
var MAX_COMMAND_LENGTH = 500;
function boundedCommand(command) {
  if (command.length <= MAX_COMMAND_LENGTH)
    return command;
  return `${command.slice(0, MAX_COMMAND_LENGTH)} \u2026 [truncated, ${command.length} chars]`;
}
var TOOL_TARGET_KEYS = [
  "pattern",
  "query",
  "url",
  "skill",
  "prompt",
  "task_id",
  "description"
];
function asRecord(value2) {
  return typeof value2 === "object" && value2 !== null && !Array.isArray(value2) ? value2 : null;
}
function asString(value2) {
  return typeof value2 === "string" && value2.trim() !== "" ? value2 : void 0;
}
function asCount(value2) {
  return typeof value2 === "number" && Number.isFinite(value2) && value2 > 0 ? Math.round(value2) : 0;
}
var DEFAULT_MAX_GOAL = 240;
var INJECTED_BLOCKS = /<(ide_selection|system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-stderr|user-prompt-submit-hook)>[\s\S]*?<\/\1>/giu;
var MIN_GOAL_LENGTH = 8;
function extractGoalText(raw) {
  const cleaned = raw.replace(INJECTED_BLOCKS, " ").replace(/<\/?[a-z][a-z0-9-]*>/giu, " ").replace(/^Caveat:[\s\S]*?<\/?[a-z-]+>/iu, " ").replace(/\s+/gu, " ").trim();
  return cleaned.length < MIN_GOAL_LENGTH ? null : cleaned;
}
function userText(message) {
  if (message === null)
    return null;
  const content = message["content"];
  if (typeof content === "string")
    return content.trim() === "" ? null : content;
  if (!Array.isArray(content))
    return null;
  const parts = [];
  for (const entry of content) {
    const block = asRecord(entry);
    if (block === null || block["type"] !== "text")
      continue;
    const text2 = asString(block["text"]);
    if (text2 !== void 0)
      parts.push(text2);
  }
  return parts.length === 0 ? null : parts.join(" ");
}
function toolEvent(block, timestamp, cwd) {
  const name = asString(block["name"]);
  if (name === void 0)
    return null;
  const input = asRecord(block["input"]) ?? {};
  const callId = asString(block["id"]);
  const type = TOOL_EVENT_TYPES[name] ?? "tool_call";
  const normalizeOptions = cwd === null ? {} : { cwd };
  const event = {
    source: "claude_code",
    type,
    timestamp,
    tool: { name },
    ...callId !== void 0 ? { metadata: { callId } } : {}
  };
  const path = asString(input["file_path"]) ?? asString(input["notebook_path"]);
  if (path !== void 0) {
    event.files = { path: normalizePath(path, normalizeOptions) };
  }
  const command = asString(input["command"]);
  if (command !== void 0) {
    event.tool = {
      ...event.tool,
      name,
      command: boundedCommand(normalizeCommand(command, normalizeOptions))
    };
  } else if (path === void 0) {
    for (const key of TOOL_TARGET_KEYS) {
      const target = asString(input[key]);
      if (target !== void 0) {
        event.tool = { ...event.tool, name, target };
        break;
      }
    }
  }
  return event;
}
function countPatch(patch) {
  if (!Array.isArray(patch))
    return null;
  let added = 0;
  let removed = 0;
  for (const entry of patch) {
    const hunk = asRecord(entry);
    const lines = hunk?.["lines"];
    if (!Array.isArray(lines))
      continue;
    for (const line of lines) {
      if (typeof line !== "string")
        continue;
      if (line.startsWith("+"))
        added += 1;
      else if (line.startsWith("-"))
        removed += 1;
    }
  }
  return { added, removed };
}
function resultEvent(block, detail, timestamp) {
  const callId = asString(block["tool_use_id"]);
  const timedOutAfterMs = detail?.["timedOutAfterMs"];
  const timedOut = typeof timedOutAfterMs === "number";
  const failed = block["is_error"] === true || timedOut;
  const patch = countPatch(detail?.["structuredPatch"]);
  const metadata = {};
  if (callId !== void 0)
    metadata["callId"] = callId;
  if (timedOut) {
    metadata["timedOut"] = true;
    metadata["timedOutAfterMs"] = timedOutAfterMs;
  }
  if (patch !== null && patch.added + patch.removed > 0) {
    metadata["linesAdded"] = patch.added;
    metadata["linesRemoved"] = patch.removed;
  }
  return {
    source: "claude_code",
    type: "tool_result",
    timestamp,
    result: {
      status: failed ? "error" : "success",
      // Reported, not inferred: Claude Code states this outright, so nothing
      // downstream has to caveat it (section 66).
      confidence: "reported",
      ...failed ? { exitCode: 1 } : { exitCode: 0 }
    },
    ...Object.keys(metadata).length > 0 ? { metadata } : {}
  };
}
function parseTranscript(lines, options = {}) {
  const maxGoal = options.maxGoalLength ?? DEFAULT_MAX_GOAL;
  const events2 = [];
  const seenUsage = /* @__PURE__ */ new Set();
  const state = {
    sessionId: null,
    title: null,
    model: null,
    cwd: null,
    gitBranch: null,
    version: null,
    goal: null,
    startedAt: null,
    endedAt: null
  };
  let malformed = 0;
  let skipped = 0;
  let duplicateUsage = 0;
  for (const line of lines) {
    if (line.trim() === "")
      continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      malformed += 1;
      continue;
    }
    const entry = asRecord(parsed);
    if (entry === null) {
      malformed += 1;
      continue;
    }
    if (entry["isSidechain"] === true && options.includeSidechains !== true) {
      skipped += 1;
      continue;
    }
    state.sessionId ??= asString(entry["sessionId"]) ?? null;
    state.cwd ??= asString(entry["cwd"]) ?? null;
    state.gitBranch ??= asString(entry["gitBranch"]) ?? null;
    state.version ??= asString(entry["version"]) ?? null;
    const timestamp = asString(entry["timestamp"]);
    if (timestamp !== void 0) {
      state.startedAt ??= timestamp;
      state.endedAt = timestamp;
    }
    const type = asString(entry["type"]);
    const message = asRecord(entry["message"]);
    if (type === "user") {
      if (timestamp === void 0) {
        skipped += 1;
        continue;
      }
      const content = message?.["content"];
      let emitted = false;
      if (Array.isArray(content)) {
        for (const item of content) {
          const block = asRecord(item);
          if (block === null || block["type"] !== "tool_result")
            continue;
          const event = resultEvent(block, asRecord(entry["toolUseResult"]), timestamp);
          if (event !== null) {
            events2.push(event);
            emitted = true;
          }
        }
      }
      const text2 = userText(message);
      if (text2 !== null) {
        if (state.goal === null) {
          const goal = extractGoalText(text2);
          if (goal !== null)
            state.goal = goal.slice(0, maxGoal);
        }
        events2.push({ source: "claude_code", type: "user_message", timestamp });
        emitted = true;
      }
      if (!emitted)
        skipped += 1;
      continue;
    }
    if (type === "assistant") {
      if (timestamp === void 0) {
        skipped += 1;
        continue;
      }
      state.model ??= asString(message?.["model"]) ?? null;
      const usage = asRecord(message?.["usage"]);
      const messageId = asString(message?.["id"]);
      if (usage !== null) {
        if (messageId !== void 0 && seenUsage.has(messageId)) {
          duplicateUsage += 1;
        } else {
          if (messageId !== void 0)
            seenUsage.add(messageId);
          const input = asCount(usage["input_tokens"]);
          const output = asCount(usage["output_tokens"]);
          const cached = asCount(usage["cache_read_input_tokens"]) + asCount(usage["cache_creation_input_tokens"]);
          if (input + output + cached > 0) {
            const details = asRecord(usage["output_tokens_details"]);
            const thinking = asCount(details?.["thinking_tokens"]);
            const cacheRead = asCount(usage["cache_read_input_tokens"]);
            const cacheCreation = asCount(usage["cache_creation_input_tokens"]);
            events2.push({
              source: "claude_code",
              type: "model_response",
              timestamp,
              tokens: { input, output, cached },
              metadata: {
                ...messageId !== void 0 ? { messageId } : {},
                ...thinking > 0 ? { thinkingTokens: thinking } : {},
                ...cacheRead > 0 ? { cacheRead } : {},
                ...cacheCreation > 0 ? { cacheCreation } : {}
              }
            });
          }
        }
      }
      let emitted = false;
      for (const item of Array.isArray(message?.["content"]) ? message["content"] : []) {
        const block = asRecord(item);
        if (block === null || block["type"] !== "tool_use")
          continue;
        const event = toolEvent(block, timestamp, state.cwd);
        if (event !== null) {
          events2.push(event);
          emitted = true;
        }
      }
      if (!emitted && usage === null)
        skipped += 1;
      continue;
    }
    if (type === "ai-title") {
      const title = asString(entry["aiTitle"]);
      if (title !== void 0)
        state.title = title;
      skipped += 1;
      continue;
    }
    skipped += 1;
  }
  if (state.startedAt !== null) {
    events2.unshift({
      source: "claude_code",
      type: "session_started",
      timestamp: state.startedAt,
      metadata: {
        ...state.title !== null ? { title: state.title } : {},
        ...state.gitBranch !== null ? { gitBranch: state.gitBranch } : {},
        ...state.version !== null ? { agentVersion: state.version } : {}
      }
    });
  }
  return {
    session: {
      sessionId: state.sessionId,
      title: state.title,
      model: state.model,
      cwd: state.cwd,
      gitBranch: state.gitBranch,
      version: state.version,
      goal: state.goal,
      startedAt: state.startedAt,
      endedAt: state.endedAt
    },
    events: events2,
    malformed,
    skipped,
    duplicateUsage
  };
}
async function findTranscripts(options = {}) {
  const root = join(options.home ?? homedir(), CLAUDE_CODE_HOME_DIR, "projects");
  let projects;
  try {
    const entries = await readdir(root, { withFileTypes: true });
    projects = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
  const matching = options.project === void 0 ? projects : projects.filter((name) => name.toLowerCase().includes(options.project.toLowerCase()));
  const found = [];
  for (const project of matching) {
    let files;
    try {
      files = (await readdir(join(root, project))).filter((name) => name.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const name of files) {
      const path = join(root, project, name);
      try {
        const info = await stat(path);
        found.push({
          path,
          sessionId: basename(name, ".jsonl"),
          project,
          modifiedAt: info.mtime.toISOString(),
          sizeBytes: info.size
        });
      } catch {
      }
    }
  }
  found.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return options.limit === void 0 ? found : found.slice(0, options.limit);
}
async function readTranscript(path, options = {}) {
  const text2 = await readFile(path, "utf8");
  return parseTranscript(text2.split("\n"), options);
}

// cli/src/import.ts
var NoTranscriptError = class extends Error {
  constructor(detail) {
    super(
      `No Claude Code session transcript found${detail}.
Claude Code writes them to ~/.claude/projects/<project>/<sessionId>.jsonl once a session runs.`
    );
    this.name = "NoTranscriptError";
  }
};
var DEFAULT_BATCH = 200;
var DEFAULT_POLL_MS = 1e3;
var wait = (ms) => ms <= 0 ? Promise.resolve() : new Promise((resolve2) => setTimeout(resolve2, ms));
function listSessions(options = {}) {
  return findTranscripts({
    ...options.home !== void 0 ? { home: options.home } : {},
    ...options.project !== void 0 ? { project: options.project } : {},
    limit: 25
  });
}
async function resolveFile2(options) {
  if (options.file !== void 0) {
    return { path: options.file, sessionId: "", project: "", modifiedAt: "", sizeBytes: 0 };
  }
  const candidates = await findTranscripts({
    ...options.home !== void 0 ? { home: options.home } : {},
    ...options.project !== void 0 ? { project: options.project } : {}
  });
  if (options.sessionId !== void 0) {
    const match = candidates.find((entry) => entry.sessionId.startsWith(options.sessionId));
    if (match === void 0) throw new NoTranscriptError(` for session "${options.sessionId}"`);
    return match;
  }
  const newest = candidates[0];
  if (newest === void 0) {
    throw new NoTranscriptError(
      options.project === void 0 ? "" : ` under a project matching "${options.project}"`
    );
  }
  return newest;
}
function observatoryId(sessionId) {
  return `cc_${sessionId}`;
}
async function importClaudeCodeSession(options = {}) {
  const client = options.client ?? createApiClient(options.server);
  const sleep = options.sleep ?? wait;
  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  const progress = options.onProgress ?? (() => {
  });
  const file = await resolveFile2(options);
  const parseOptions = options.includeSidechains === true ? { includeSidechains: true } : {};
  let parsed = await readTranscript(file.path, parseOptions);
  const transcriptId = parsed.session.sessionId ?? file.sessionId;
  if (transcriptId === "") throw new NoTranscriptError(` in ${file.path}`);
  const sessionId = observatoryId(transcriptId);
  let alreadyStored = 0;
  try {
    const existing = await client.getSession(sessionId);
    alreadyStored = existing.session.eventCount;
  } catch {
    await client.createSession({
      id: sessionId,
      source: "claude_code",
      ...parsed.session.model !== null ? { model: parsed.session.model } : {},
      ...parsed.session.goal !== null ? { goal: parsed.session.goal } : {},
      ...parsed.session.startedAt !== null ? { startedAt: parsed.session.startedAt } : {}
    });
  }
  let sent = 0;
  let redactions = 0;
  const push = async (events2) => {
    for (let index2 = 0; index2 < events2.length; index2 += batchSize) {
      const batch = events2.slice(index2, index2 + batchSize);
      const result = await client.sendEvents(sessionId, batch);
      sent += result.accepted;
      redactions += result.redactions;
      progress(`  sent ${sent} events`);
    }
  };
  await push(parsed.events.slice(alreadyStored));
  let delivered = Math.max(alreadyStored, parsed.events.length);
  if (options.watch === true) {
    const shouldContinue = options.shouldContinue ?? (() => true);
    progress(`Watching ${file.path}`);
    while (shouldContinue()) {
      await sleep(options.pollMs ?? DEFAULT_POLL_MS);
      if (!shouldContinue()) break;
      const next = await readTranscript(file.path, parseOptions);
      if (next.events.length > delivered) {
        await push(next.events.slice(delivered));
        delivered = next.events.length;
        parsed = next;
      }
    }
  }
  return {
    sessionId,
    file: file.path,
    sent,
    alreadyStored,
    redactions,
    parsed,
    server: client.server
  };
}

// cli/src/program.ts
init_dist();
import { Command, InvalidArgumentError, Option } from "commander";

// cli/src/bundle.ts
import { existsSync, mkdirSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";
function userDataDir() {
  const directory = join2(homedir2(), ".observatory");
  mkdirSync(directory, { recursive: true });
  return directory;
}
function resolveBundle() {
  const here = dirname(fileURLToPath(import.meta.url));
  const dashboardDir = join2(here, "dashboard");
  const migrationsFolder = join2(here, "migrations");
  if (!existsSync(dashboardDir) || !existsSync(migrationsFolder)) return null;
  return {
    dashboardDir,
    migrationsFolder,
    databaseFile: join2(userDataDir(), "observatory.db")
  };
}

// cli/src/commands.ts
import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { dirname as dirname2 } from "node:path";
init_dist();
init_dist2();
var DEFAULT_DASHBOARD = "http://127.0.0.1:4001";
function pad(value2, width) {
  if (value2.length < width) return value2 + " ".repeat(width - value2.length);
  return `${value2.slice(0, Math.max(1, width - 2))}\u2026 `;
}
function padStart(value2, width) {
  return value2.length >= width ? value2 : " ".repeat(width - value2.length) + value2;
}
var STATE_MARK = {
  improving: "\u25B2",
  stable: "\u25CF",
  degrading: "\u25BC",
  insufficient_data: "\xB7"
};
function ago(iso) {
  const elapsed = Date.now() - Date.parse(iso);
  if (!Number.isFinite(elapsed)) return "unknown";
  const minutes = Math.round(elapsed / 6e4);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
async function statusReport(options = {}) {
  const client = options.client ?? createApiClient(options.server);
  const health = await client.health();
  const { sessions: sessions2 } = await client.listSessions();
  const active = sessions2.filter((session) => session.status === "active");
  const lines = [
    "",
    `  Observatory ${health.version}   ${client.server}`,
    "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
    `  API         up, contract v${health.contractVersion}`,
    `  Database    ${health.database.location}`,
    `  Sessions    ${health.database.sessions} recorded, ${active.length} active`,
    `  Watchers    ${health.subscribers} dashboard${health.subscribers === 1 ? "" : "s"} attached`,
    `  Uptime      ${Math.max(1, health.uptimeSeconds)}s`,
    ""
  ];
  const newest = sessions2[0];
  if (newest !== void 0) {
    lines.push(
      `  Latest      ${STATE_MARK[newest.state] ?? "\xB7"} ${newest.state} \xB7 health ${newest.health ?? "n/a"} \xB7 ${newest.eventCount} events \xB7 ${ago(newest.startedAt)}`,
      ""
    );
  }
  return lines.join("\n");
}
async function sessionsReport(options = {}) {
  const client = options.client ?? createApiClient(options.server);
  const { sessions: sessions2 } = await client.listSessions();
  const shown = options.limit === void 0 ? sessions2 : sessions2.slice(0, options.limit);
  if (options.json === true) return JSON.stringify(shown, null, 2);
  if (shown.length === 0) {
    return "\n  No sessions recorded yet.\n\n  Generate one:   observatory demo --scenario improving --stream\n  Or observe one: observatory import\n";
  }
  const rows = [
    "",
    `  ${pad("SESSION", 24)}${pad("SOURCE", 12)}${padStart("HEALTH", 7)}  ${pad("STATE", 13)}${padStart("EVENTS", 7)}  STARTED`
  ];
  for (const session of shown) {
    rows.push(
      `  ${pad(session.id, 24)}${pad(session.simulated ? "simulated" : session.source, 12)}${padStart(session.health === null ? "n/a" : String(session.health), 7)}  ${pad(`${STATE_MARK[session.state] ?? "\xB7"} ${session.state}`, 13)}${padStart(String(session.eventCount), 7)}  ${ago(session.startedAt)}`
    );
  }
  rows.push("");
  return rows.join("\n");
}
function openCommand(url) {
  switch (process.platform) {
    case "win32":
      return { command: "cmd", args: ["/c", "start", "", url] };
    case "darwin":
      return { command: "open", args: [url] };
    default:
      return { command: "xdg-open", args: [url] };
  }
}
function openDashboard(options = {}) {
  const url = options.url ?? process.env["OBSERVATORY_DASHBOARD"] ?? (options.packaged === true ? options.server ?? DEFAULT_SERVER : DEFAULT_DASHBOARD);
  if (options.print === true) return url;
  const launch = options.open ?? ((target) => {
    const { command, args } = openCommand(target);
    const child = spawn(command, [...args], { detached: true, stdio: "ignore" });
    child.unref();
  });
  launch(url);
  return url;
}
var MIN_NODE_MAJOR = 20;
function checkNode() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  return major >= MIN_NODE_MAJOR ? { name: "Node.js", status: "ok", detail: `${process.version} on ${platform()} ${arch()}` } : {
    name: "Node.js",
    status: "fail",
    detail: `${process.version} is too old`,
    remedy: `The Observatory needs Node ${MIN_NODE_MAJOR}.11 or newer.`
  };
}
async function checkServer(client) {
  try {
    const health = await client.health();
    return [
      {
        name: "API server",
        status: "ok",
        detail: `${client.server} \xB7 ${health.database.sessions} sessions`
      },
      { name: "Database", status: "ok", detail: health.database.location }
    ];
  } catch (error) {
    return [
      {
        name: "API server",
        status: error instanceof ServerUnreachableError ? "warn" : "fail",
        detail: `not reachable at ${client.server}`,
        remedy: "Start it with `observatory start`, or `npm run dev` for the dashboard too."
      }
    ];
  }
}
async function checkDashboard(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok ? { name: "Dashboard", status: "ok", detail: url } : {
      name: "Dashboard",
      status: "warn",
      detail: `${url} answered ${response.status}`,
      remedy: "Start it with `npm run dev:web`."
    };
  } catch {
    return {
      name: "Dashboard",
      status: "warn",
      detail: `not reachable at ${url}`,
      remedy: "Start it with `npm run dev:web`. The CLI works without it."
    };
  }
}
async function checkClaudeCode(home) {
  const found = await findTranscripts(home === void 0 ? {} : { home });
  const newest = found[0];
  if (newest === void 0) {
    return {
      name: "Claude Code",
      status: "warn",
      detail: "no session transcripts found",
      remedy: "Run a Claude Code session; it writes a transcript under ~/.claude/projects as it works."
    };
  }
  return {
    name: "Claude Code",
    status: "ok",
    detail: `${found.length} session${found.length === 1 ? "" : "s"}, newest ${ago(newest.modifiedAt)}`
  };
}
function checkCodex() {
  return {
    name: "Codex",
    status: "warn",
    detail: "adapter not implemented (Phase 12)",
    remedy: "Codex rollout logs are readable in principle; nothing reads them yet."
  };
}
async function checkWritable(location) {
  const directory = dirname2(location);
  try {
    await access(directory, constants.W_OK);
    return { name: "Data directory", status: "ok", detail: directory };
  } catch {
    return {
      name: "Data directory",
      status: "fail",
      detail: `${directory} is not writable`,
      remedy: "Point OBSERVATORY_DB somewhere writable."
    };
  }
}
function checkScoring() {
  const problems = validateScoringConfig(DEFAULT_SCORING_CONFIG);
  return problems.length === 0 ? {
    name: "Scoring config",
    status: "ok",
    detail: `weights valid \xB7 ${Object.keys(DEFAULT_SCORING_CONFIG.health.weights).length} health components`
  } : {
    name: "Scoring config",
    status: "fail",
    detail: problems.map((problem) => `${problem.group}: ${problem.message}`).join("; "),
    remedy: "Every weight group in packages/shared/src/scoring.ts must sum to 1."
  };
}
function checkRedaction() {
  const kinds = redactionKinds();
  return kinds.length > 0 ? {
    name: "Secret redaction",
    status: "ok",
    detail: `${kinds.length} credential formats recognised`
  } : {
    name: "Secret redaction",
    status: "fail",
    detail: "no patterns loaded",
    remedy: "packages/telemetry/src/redact.ts has no patterns."
  };
}
async function runChecks(options = {}) {
  const client = options.client ?? createApiClient(options.server);
  const serverChecks = await checkServer(client);
  const database = serverChecks.find((check) => check.name === "Database")?.detail;
  return [
    checkNode(),
    ...serverChecks,
    await checkDashboard(options.dashboardUrl ?? DEFAULT_DASHBOARD),
    await checkWritable(
      database === void 0 || database === "memory" ? "data/observatory.db" : database
    ),
    await checkClaudeCode(options.home),
    checkCodex(),
    checkScoring(),
    checkRedaction()
  ];
}
var MARK = { ok: "\u2713", warn: "\u26A0", fail: "\u2717" };
async function doctorReport(options = {}) {
  const checks = await runChecks(options);
  const lines = [
    "",
    `  observatory doctor \xB7 v${OBSERVATORY_VERSION} \xB7 ${platform()} ${release()}`,
    ""
  ];
  for (const check of checks) {
    lines.push(`  ${MARK[check.status]} ${pad(check.name, 18)}${check.detail}`);
    if (check.remedy !== void 0) lines.push(`      ${check.remedy}`);
  }
  const failed = checks.filter((check) => check.status === "fail").length;
  const warned = checks.filter((check) => check.status === "warn").length;
  lines.push("");
  lines.push(
    failed > 0 ? `  ${failed} problem${failed === 1 ? "" : "s"} to fix.` : warned > 0 ? `  Everything essential works. ${warned} thing${warned === 1 ? "" : "s"} not set up.` : "  Everything checks out."
  );
  lines.push("");
  return lines.join("\n");
}
var RATE_METRICS2 = /* @__PURE__ */ new Set([
  "successRate",
  "errorRate",
  "recoveryRate",
  "repetitionRate",
  "toolEfficiency"
]);
var METRIC_LABELS2 = {
  health: "Health",
  learning: "Learning",
  successRate: "Success rate",
  errorRate: "Error rate",
  recoveryRate: "Recovery rate",
  repetitionRate: "Repetition",
  toolEfficiency: "Tool efficiency"
};
function value(metric, raw) {
  if (raw === null) return "n/a";
  return RATE_METRICS2.has(metric) ? `${Math.round(raw * 100)}%` : String(Math.round(raw));
}
function change(metric, delta, better) {
  if (delta === null) return "";
  const size = RATE_METRICS2.has(metric) ? `${delta > 0 ? "+" : ""}${Math.round(delta * 100)} pts` : `${delta > 0 ? "+" : ""}${Math.round(delta)}`;
  if (better === null) return `${size}  unchanged`;
  return `${size}  ${better ? "better" : "worse"}`;
}
async function compareReport(options = {}) {
  const client = options.client ?? createApiClient(options.server);
  if (options.by !== void 0) {
    const result2 = await client.compareGroups(options.by);
    if (options.json === true) return JSON.stringify(result2, null, 2);
    if (result2.groups.length === 0) {
      return `
  No sessions carry a ${options.by} to group by.
`;
    }
    const lines2 = [
      "",
      `  Sessions grouped by ${result2.groupBy}`,
      "",
      `  ${pad("GROUP", 34)}${padStart("N", 3)}${padStart("HEALTH", 8)}${padStart("LEARNING", 10)}${padStart("SUCCESS", 9)}${padStart("RECOVERY", 10)}  STATES`
    ];
    for (const group of result2.groups) {
      const states = ["improving", "stable", "degrading"].map((state) => `${STATE_MARK[state] ?? ""}${group.states[state] ?? 0}`).join(" ");
      lines2.push(
        `  ${pad(group.key, 34)}${padStart(String(group.sessions), 3)}${padStart(value("health", group.health), 8)}${padStart(value("learning", group.learning), 10)}${padStart(value("successRate", group.successRate), 9)}${padStart(value("recoveryRate", group.recoveryRate), 10)}  ${states}`
      );
    }
    lines2.push("");
    if (result2.ungrouped > 0) {
      lines2.push(`  ${result2.ungrouped} session(s) had no ${result2.groupBy} and were left out.`);
    }
    lines2.push("  Medians, not means. A group of one is a data point, not a comparison.");
    lines2.push("");
    return lines2.join("\n");
  }
  if (options.left === void 0 || options.right === void 0) {
    throw new Error("compare needs either --by <model|goal|source>, or two session ids");
  }
  const result = await client.compareSessions(options.left, options.right);
  if (options.json === true) return JSON.stringify(result, null, 2);
  const lines = [
    "",
    `  left    ${result.left.session.id}   (${result.left.scores.state})`,
    `  right   ${result.right.session.id}   (${result.right.scores.state})`,
    "",
    `  ${pad("", 18)}${padStart("LEFT", 9)}${padStart("RIGHT", 9)}   CHANGE`
  ];
  for (const delta of result.deltas) {
    lines.push(
      `  ${pad(METRIC_LABELS2[delta.metric] ?? delta.metric, 18)}${padStart(value(delta.metric, delta.left), 9)}${padStart(value(delta.metric, delta.right), 9)}   ` + change(delta.metric, delta.delta, delta.better)
    );
  }
  if (result.onlyRightSignals.length > 0) {
    lines.push("");
    lines.push("  Only on the right:");
    for (const signal of result.onlyRightSignals.slice(0, 5)) lines.push(`    + ${signal}`);
  }
  if (result.onlyLeftSignals.length > 0) {
    lines.push("");
    lines.push("  Only on the left:");
    for (const signal of result.onlyLeftSignals.slice(0, 5)) lines.push(`    - ${signal}`);
  }
  lines.push("");
  return lines.join("\n");
}

// cli/src/demo.ts
init_dist4();
init_dist2();
function runDemo(options) {
  const demo = generateDemoSession({
    scenario: options.scenario,
    ...options.seed !== void 0 ? { seed: options.seed } : {},
    ...options.startedAt !== void 0 ? { startedAt: options.startedAt } : {},
    ...options.sessionId !== void 0 ? { sessionId: options.sessionId } : {}
  });
  const processor = createEventProcessor({
    idFactory: sequentialIds(`${demo.sessionId}_e`),
    // Never consulted: every generated event carries its own timestamp. Fixed
    // anyway, so that nothing in this path can depend on the wall clock.
    now: fixedClock(demo.startedAt)
  });
  const processed = processor.ingestMany(demo.sessionId, demo.events);
  const events2 = processed.map((entry) => entry.event);
  const analysis = analyzeSession(events2, {
    goal: { text: demo.goal, keywords: demo.goalKeywords },
    metrics: { context: { reportedMaximum: demo.contextWindow } }
  });
  return {
    demo,
    events: events2,
    analysis,
    redactions: processed.reduce(
      (total, entry) => total + entry.redactions.reduce((sum2, hit) => sum2 + hit.count, 0),
      0
    )
  };
}
var STATE_LABEL = {
  improving: "\u25B2 IMPROVING",
  stable: "\u25CF STABLE",
  degrading: "\u25BC DEGRADING",
  insufficient_data: "\xB7 NOT ENOUGH DATA"
};
var WINDOW_LABELS = ["early", "middle", "recent"];
var REASON_MARK = {
  positive: "\u2713",
  negative: "\u2717",
  warning: "\u26A0",
  neutral: "\xB7"
};
function percent(value2) {
  return value2 === null ? "n/a" : `${Math.round(value2 * 100)}%`;
}
function score2(value2) {
  return value2 === null ? "n/a" : `${value2} / 100`;
}
function count(value2) {
  if (value2 < 1e3) return String(value2);
  if (value2 < 1e6) return `${(value2 / 1e3).toFixed(1).replace(/\.0$/u, "")}K`;
  return `${(value2 / 1e6).toFixed(1).replace(/\.0$/u, "")}M`;
}
function duration(ms) {
  if (ms === null) return "n/a";
  const seconds = Math.round(ms / 1e3);
  const minutes = Math.floor(seconds / 60);
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}
function pad2(value2, width) {
  return value2.length >= width ? value2 : value2 + " ".repeat(width - value2.length);
}
function padStart2(value2, width) {
  return value2.length >= width ? value2 : " ".repeat(width - value2.length) + value2;
}
function formatDemoReport(run) {
  const { demo, analysis } = run;
  const metrics2 = analysis.metrics;
  const lines = [];
  lines.push("");
  lines.push("  AI Agent Observatory \u2014 simulated session");
  lines.push("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  lines.push("  SIMULATED DATA. Generated by `observatory demo`; not observed from");
  lines.push("  a real agent. Every event is flagged `simulated` in the store.");
  lines.push("");
  lines.push(`  Session    ${demo.sessionId} \xB7 ${demo.source} \xB7 ${demo.model}`);
  lines.push(`  Scenario   ${demo.scenario} (seed "${demo.seed}") \u2014 ${demo.headline}`);
  lines.push(`  Goal       ${demo.goal}`);
  lines.push(
    `  Span       ${duration(metrics2.durationMs)} \xB7 ${run.events.length} events \xB7 ${metrics2.counters.totalToolCalls} actions`
  );
  lines.push("");
  lines.push(
    `  AGENT HEALTH          ${pad2(score2(analysis.health.score), 10)} ${analysis.health.state} (${analysis.health.measuredComponents}/5 components measured)`
  );
  lines.push(
    `  BEHAVIORAL LEARNING   ${pad2(score2(analysis.learning.score), 10)} ${STATE_LABEL[analysis.currentState] ?? analysis.currentState}`
  );
  lines.push(`  DEGRADATION           ${pad2(score2(analysis.degradation.score), 10)}`);
  lines.push("");
  lines.push(
    "  " + [
      `Tokens ${count(metrics2.tokens.total)}`,
      `Tools ${metrics2.counters.totalToolCalls}`,
      `Errors ${metrics2.counters.errors}`,
      `Recovery ${percent(metrics2.recoveryRate)}`,
      `Repetition ${percent(metrics2.repetitionRate)}`,
      `Context ${percent(metrics2.contextPressure)}`
    ].join("   ")
  );
  lines.push("");
  lines.push("  WHAT THE SIMULATED AGENT DID");
  demo.narrative.forEach((line, index2) => {
    lines.push(`    ${pad2(WINDOW_LABELS[index2] ?? `phase ${index2 + 1}`, 8)}${line}`);
  });
  lines.push("");
  lines.push("  WINDOW      actions   errors   recovery   repetition   on-goal");
  for (const window of analysis.windows.windows) {
    lines.push(
      `  ${pad2(window.label, 12)}${padStart2(String(window.actions), 5)}${padStart2(percent(window.errorRate), 9)}${padStart2(percent(window.recoveryRate), 11)}${padStart2(percent(window.repetitionRate), 13)}${padStart2(percent(window.goalAdherence), 10)}`
    );
  }
  lines.push("");
  const title = analysis.currentState === "insufficient_data" ? "WHY THERE IS NO VERDICT YET" : `WHY THE AGENT IS ${analysis.currentState.toUpperCase()}`;
  lines.push(`  ${title}`);
  if (analysis.reasons.length === 0) {
    lines.push("    \xB7 nothing measurable changed across the session");
  }
  for (const reason of analysis.reasons) {
    lines.push(`    ${REASON_MARK[reason.type]} ${reason.message}`);
  }
  lines.push("");
  const signals2 = signalsFor(demo.sessionId, analysis);
  if (signals2.length > 0) {
    lines.push("  SIGNALS");
    for (const signal of signals2) {
      lines.push(`    [${pad2(signal.severity, 8)}] ${signal.message}`);
    }
    lines.push("");
  }
  lines.push("  Behavioral learning measures the agent's observable behavior in this session.");
  lines.push("  It is not model learning: no weights, gradients or loss are involved.");
  lines.push("");
  return lines.map((line) => line.trimEnd()).join("\n");
}
function demoSummary(run) {
  const { demo, analysis } = run;
  return {
    simulated: true,
    session: {
      id: demo.sessionId,
      source: demo.source,
      model: demo.model,
      scenario: demo.scenario,
      seed: demo.seed,
      goal: demo.goal,
      goalKeywords: demo.goalKeywords,
      startedAt: demo.startedAt,
      endedAt: demo.endedAt,
      contextWindow: demo.contextWindow
    },
    scores: {
      health: analysis.health.score,
      healthState: analysis.health.state,
      learning: analysis.learning.score,
      state: analysis.currentState,
      degradation: analysis.degradation.score
    },
    metrics: analysis.metrics,
    counts: analysis.counts,
    windows: analysis.windows.windows,
    reasons: analysis.reasons,
    signals: signalsFor(demo.sessionId, analysis)
  };
}

// cli/src/stream.ts
var MAX_GAP_MS = 1400;
var DEFAULT_SPEED = 6;
var wait2 = (ms) => ms <= 0 ? Promise.resolve() : new Promise((resolve2) => setTimeout(resolve2, ms));
function labelOf(event) {
  if (event.tool?.command !== void 0) return event.tool.command;
  if (event.files?.path !== void 0) return `${event.type} ${event.files.path}`;
  if (event.result?.status !== void 0) return `${event.type} (${event.result.status})`;
  return event.type;
}
async function streamDemo(options) {
  const client = options.client ?? createApiClient(options.server);
  const sleep = options.sleep ?? wait2;
  const speed = Math.max(0.1, options.speed ?? DEFAULT_SPEED);
  const demo = generateDemoSession({
    scenario: options.scenario,
    ...options.seed !== void 0 ? { seed: options.seed } : {},
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  await client.createSession({
    id: demo.sessionId,
    source: demo.source,
    model: demo.model,
    goal: demo.goal,
    goalKeywords: [...demo.goalKeywords],
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  const startedAt = Date.now();
  let sent = 0;
  let redactions = 0;
  let previous = null;
  for (const event of demo.events) {
    const at = Date.parse(event.timestamp ?? "");
    if (previous !== null && Number.isFinite(at)) {
      await sleep(Math.min(MAX_GAP_MS, Math.round((at - previous) / speed)));
    }
    if (Number.isFinite(at)) previous = at;
    const { timestamp: _dropped, ...payload } = event;
    const result = await client.sendEvent(demo.sessionId, payload);
    sent += result.accepted;
    redactions += result.redactions ?? 0;
    options.onProgress?.(sent, demo.events.length, labelOf(event));
  }
  await client.endSession(demo.sessionId);
  return {
    sessionId: demo.sessionId,
    sent,
    redactions,
    elapsedMs: Date.now() - startedAt,
    server: client.server
  };
}

// cli/src/program.ts
function buildProgram(options = {}) {
  const out = options.out ?? ((text2) => console.log(text2));
  const program = new Command();
  program.name("observatory").description(
    "AI Agent Observatory - local-first behavioral observability for AI coding agents.\nMeasures observable agent behavior. It does not measure model weights, gradients or loss."
  ).version(OBSERVATORY_VERSION, "-v, --version");
  program.command("start").description("Start the local API server. Runs until interrupted.").option("-p, --port <port>", "port to listen on").option("--host <host>", "interface to bind (loopback by default)").option("--quiet", "suppress request logging").action(async (commandOptions) => {
    const { loadConfig: loadConfig2, startServer: startServer2 } = await Promise.resolve().then(() => (init_api(), api_exports));
    const port = commandOptions.port === void 0 ? void 0 : Number.parseInt(commandOptions.port, 10);
    if (port !== void 0 && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new InvalidArgumentError(`--port must be a number between 1 and 65535`);
    }
    const bundle = resolveBundle();
    const config = bundle === null || process.env["OBSERVATORY_DB"] !== void 0 ? void 0 : { ...loadConfig2(), databaseFile: bundle.databaseFile };
    const server = await startServer2({
      logger: commandOptions.quiet !== true,
      ...port !== void 0 ? { port } : {},
      ...commandOptions.host !== void 0 ? { host: commandOptions.host } : {},
      ...config !== void 0 ? { config } : {},
      ...bundle !== null ? { dashboardDir: bundle.dashboardDir, migrationsFolder: bundle.migrationsFolder } : {}
    });
    out(
      bundle === null ? `Observatory API listening on ${server.url}` : `Observatory running on ${server.url}`
    );
    out(`Database ${server.app.database.file}`);
    out("");
    if (bundle !== null) out(`  Dashboard   ${server.url}`);
    out("  observatory demo --stream    generate a simulated session");
    out("  observatory import           observe a real Claude Code session");
    out("  observatory dashboard        open the dashboard");
    out("");
    out("Press Ctrl+C to stop.");
    await new Promise((resolve2) => {
      const stop = () => {
        out("\nStopping.");
        void server.close().then(resolve2);
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  });
  program.command("status").description("Show what the local Observatory is doing.").option("--server <url>", "Observatory API", DEFAULT_SERVER).action(async (commandOptions) => {
    out(await statusReport({ server: commandOptions.server }));
  });
  program.command("sessions").description("List recorded sessions with their headline scores.").option("--server <url>", "Observatory API", DEFAULT_SERVER).option("--json", "print the raw list as JSON").option("-n, --limit <count>", "how many to show").action(async (commandOptions) => {
    const limit = commandOptions.limit === void 0 ? void 0 : Number.parseInt(commandOptions.limit, 10);
    out(
      await sessionsReport({
        server: commandOptions.server,
        ...commandOptions.json === true ? { json: true } : {},
        ...limit !== void 0 && Number.isInteger(limit) ? { limit } : {}
      })
    );
  });
  program.command("dashboard").description("Open the dashboard in a browser.").option("--url <url>", "dashboard address").option("--print", "print the URL instead of opening it").action((commandOptions) => {
    const url = openDashboard({
      ...commandOptions.url !== void 0 ? { url: commandOptions.url } : {},
      ...commandOptions.print === true ? { print: true } : {},
      ...resolveBundle() !== null ? { packaged: true, server: DEFAULT_SERVER } : {}
    });
    out(commandOptions.print === true ? url : `Opening ${url}`);
  });
  program.command("demo").description(
    "Generate a simulated agent session, analyze it, and print the result.\nThe data is synthetic and is labelled as such; no agent is observed."
  ).addOption(
    new Option("-s, --scenario <scenario>", "which simulated session to generate").choices([...DEMO_SCENARIOS]).default("improving")
  ).option("--seed <seed>", "seed for deterministic generation", "observatory").option("--started-at <iso>", "ISO timestamp the simulated session starts at").option("--json", "print the analysis as JSON instead of a report").option("--events", "print the generated events as NDJSON, one per line").option("--stream", "replay the session into the running server, live").option("--server <url>", "Observatory API to stream to", DEFAULT_SERVER).option("--speed <factor>", "how much faster than real time to replay", "6").action(async (commandOptions) => {
    if (!isDemoScenario(commandOptions.scenario)) {
      throw new InvalidArgumentError(
        `unknown scenario "${commandOptions.scenario}" - expected one of ${DEMO_SCENARIOS.join(", ")}`
      );
    }
    if (commandOptions.stream === true) {
      const speed = Number.parseFloat(commandOptions.speed);
      if (!Number.isFinite(speed) || speed <= 0) {
        throw new InvalidArgumentError(
          `--speed must be a positive number, got "${commandOptions.speed}"`
        );
      }
      out(`Streaming a ${commandOptions.scenario} session to ${commandOptions.server}`);
      out("Open the dashboard at http://127.0.0.1:4001 to watch it arrive.\n");
      const result = await streamDemo({
        scenario: commandOptions.scenario,
        seed: commandOptions.seed,
        server: commandOptions.server,
        speed,
        onProgress: (sent, total, label) => {
          out(`  ${String(sent).padStart(3)}/${total}  ${label}`);
        }
      });
      out(
        `
Done. ${result.sent} events in ${(result.elapsedMs / 1e3).toFixed(1)}s as session ${result.sessionId}.`
      );
      out("The data is simulated and is labelled as such in the dashboard.");
      return;
    }
    const run = runDemo({
      scenario: commandOptions.scenario,
      seed: commandOptions.seed,
      ...commandOptions.startedAt !== void 0 ? { startedAt: commandOptions.startedAt } : {}
    });
    if (commandOptions.events === true) {
      for (const event of run.events) out(JSON.stringify(event));
      return;
    }
    out(
      commandOptions.json === true ? JSON.stringify(demoSummary(run), null, 2) : formatDemoReport(run)
    );
  });
  program.command("import").description(
    "Observe a real Claude Code session by reading its local transcript.\nOnly the shape of the work is sent - paths, commands, outcomes, token counts.\nFile contents, command output and prompt text stay on your machine."
  ).option("--list", "list the sessions that could be imported, newest first").option("--session <id>", "import a specific Claude Code session id (prefix is enough)").option("--file <path>", "import a specific transcript file").option("--project <name>", "only look at project directories matching this").option("--watch", "keep following the session as the agent works").option("--include-sidechains", "include sub-agent work in the parent session").option("--server <url>", "Observatory API to send to", DEFAULT_SERVER).action(async (commandOptions) => {
    if (commandOptions.list === true) {
      const found = await listSessions({
        ...commandOptions.project !== void 0 ? { project: commandOptions.project } : {}
      });
      if (found.length === 0) {
        out("No Claude Code transcripts found under ~/.claude/projects.");
        return;
      }
      out(`${found.length} session${found.length === 1 ? "" : "s"}, newest first:
`);
      for (const entry of found) {
        const size = `${Math.max(1, Math.round(entry.sizeBytes / 1024))}KB`;
        out(
          `  ${entry.sessionId.slice(0, 8)}  ${entry.modifiedAt.slice(0, 19).replace("T", " ")}  ${size.padStart(7)}  ${entry.project}`
        );
      }
      return;
    }
    const result = await importClaudeCodeSession({
      ...commandOptions.file !== void 0 ? { file: commandOptions.file } : {},
      ...commandOptions.session !== void 0 ? { sessionId: commandOptions.session } : {},
      ...commandOptions.project !== void 0 ? { project: commandOptions.project } : {},
      ...commandOptions.includeSidechains === true ? { includeSidechains: true } : {},
      ...commandOptions.watch === true ? { watch: true } : {},
      server: commandOptions.server,
      onProgress: out
    });
    const { parsed } = result;
    out("");
    out(`Imported ${result.sent} events from ${result.file}`);
    out(
      `  session   ${result.sessionId}` + (result.alreadyStored > 0 ? ` (${result.alreadyStored} already stored)` : "")
    );
    out(`  model     ${parsed.session.model ?? "unknown"}`);
    out(`  goal      ${parsed.session.goal ?? "not stated"}`);
    out(
      `  skipped   ${parsed.skipped} bookkeeping lines, ${parsed.malformed} unreadable, ${parsed.duplicateUsage} duplicate usage blocks`
    );
    if (result.redactions > 0) {
      out(`  redacted  ${result.redactions} secrets before storage`);
    }
    out("");
    out("Open the dashboard at http://127.0.0.1:4001 to see it.");
  });
  program.command("compare").description(
    "Compare two sessions, or every session grouped by model, goal or source.\nGrouped comparison is observational: it shows differences, not causes."
  ).argument("[left]", "session id to compare from").argument("[right]", "session id to compare to").addOption(
    new Option("--by <key>", "group every session instead of comparing two").choices([
      "model",
      "goal",
      "source"
    ])
  ).option("--server <url>", "Observatory API", DEFAULT_SERVER).option("--json", "print the raw comparison as JSON").action(
    async (left, right, commandOptions) => {
      if (commandOptions.by === void 0 && (left === void 0 || right === void 0)) {
        throw new InvalidArgumentError(
          "pass two session ids, or --by model|goal|source to group them"
        );
      }
      out(
        await compareReport({
          server: commandOptions.server,
          ...commandOptions.by !== void 0 ? { by: commandOptions.by } : {},
          ...left !== void 0 ? { left } : {},
          ...right !== void 0 ? { right } : {},
          ...commandOptions.json === true ? { json: true } : {}
        })
      );
    }
  );
  program.command("doctor").description("Check the local environment and agent integrations.").option("--server <url>", "Observatory API", DEFAULT_SERVER).option("--dashboard <url>", "dashboard address").action(async (commandOptions) => {
    out(
      await doctorReport({
        server: commandOptions.server,
        ...commandOptions.dashboard !== void 0 ? { dashboardUrl: commandOptions.dashboard } : {}
      })
    );
  });
  return program;
}

// cli/src/index.ts
function report(error) {
  if (error instanceof ServerUnreachableError || error instanceof NoTranscriptError || error instanceof ApiError) {
    console.error(error.message);
    process.exit(1);
  }
  if (error instanceof Error && error.name === "CommanderError") process.exit(1);
  throw error;
}
try {
  await buildProgram().parseAsync(process.argv);
} catch (error) {
  report(error);
}
