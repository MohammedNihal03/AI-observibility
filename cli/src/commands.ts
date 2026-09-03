import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { dirname } from "node:path";

import { findTranscripts } from "@observatory/collectors";
import {
  DEFAULT_SCORING_CONFIG,
  OBSERVATORY_VERSION,
  validateScoringConfig,
} from "@observatory/shared";
import { redactionKinds } from "@observatory/telemetry";

import { createApiClient, ServerUnreachableError, type ApiClient } from "./api.js";

/**
 * `status`, `sessions`, `dashboard` and `doctor` (BUILD.md section 33, Phase 10).
 *
 * Each returns a string rather than printing, so the output writer stays
 * injectable and these stay testable without trapping stdout.
 */

const DEFAULT_DASHBOARD = "http://127.0.0.1:4001";

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Pads to `width`, truncating with an ellipsis rather than a hard cut.
 *
 * A hard cut leaves no gap before the next column, so a long session id runs
 * straight into the source beside it and the table stops being a table.
 */
function pad(value: string, width: number): string {
  if (value.length < width) return value + " ".repeat(width - value.length);
  return `${value.slice(0, Math.max(1, width - 2))}… `;
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

const STATE_MARK: Record<string, string> = {
  improving: "▲",
  stable: "●",
  degrading: "▼",
  insufficient_data: "·",
};

function ago(iso: string): string {
  const elapsed = Date.now() - Date.parse(iso);
  if (!Number.isFinite(elapsed)) return "unknown";
  const minutes = Math.round(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export interface CommandOptions {
  readonly server?: string;
  readonly client?: ApiClient;
}

/* -------------------------------------------------------------------------- */
/* status                                                                     */
/* -------------------------------------------------------------------------- */

export async function statusReport(options: CommandOptions = {}): Promise<string> {
  const client = options.client ?? createApiClient(options.server);
  const health = await client.health();
  const { sessions } = await client.listSessions();

  const active = sessions.filter((session) => session.status === "active");
  const lines = [
    "",
    `  Observatory ${health.version}   ${client.server}`,
    "  ─────────────────────────────────────────────",
    `  API         up, contract v${health.contractVersion}`,
    `  Database    ${health.database.location}`,
    `  Sessions    ${health.database.sessions} recorded, ${active.length} active`,
    `  Watchers    ${health.subscribers} dashboard${health.subscribers === 1 ? "" : "s"} attached`,
    `  Uptime      ${Math.max(1, health.uptimeSeconds)}s`,
    "",
  ];

  const newest = sessions[0];
  if (newest !== undefined) {
    lines.push(
      `  Latest      ${STATE_MARK[newest.state] ?? "·"} ${newest.state}` +
        ` · health ${newest.health ?? "n/a"}` +
        ` · ${newest.eventCount} events · ${ago(newest.startedAt)}`,
      "",
    );
  }

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* sessions                                                                   */
/* -------------------------------------------------------------------------- */

export interface SessionsOptions extends CommandOptions {
  readonly json?: boolean;
  readonly limit?: number;
}

export async function sessionsReport(options: SessionsOptions = {}): Promise<string> {
  const client = options.client ?? createApiClient(options.server);
  const { sessions } = await client.listSessions();
  const shown = options.limit === undefined ? sessions : sessions.slice(0, options.limit);

  if (options.json === true) return JSON.stringify(shown, null, 2);

  if (shown.length === 0) {
    return (
      "\n  No sessions recorded yet.\n\n" +
      "  Generate one:   observatory demo --scenario improving --stream\n" +
      "  Or observe one: observatory import\n"
    );
  }

  const rows = [
    "",
    `  ${pad("SESSION", 24)}${pad("SOURCE", 12)}${padStart("HEALTH", 7)}  ` +
      `${pad("STATE", 13)}${padStart("EVENTS", 7)}  STARTED`,
  ];

  for (const session of shown) {
    rows.push(
      `  ${pad(session.id, 24)}` +
        `${pad(session.simulated ? "simulated" : session.source, 12)}` +
        `${padStart(session.health === null ? "n/a" : String(session.health), 7)}  ` +
        `${pad(`${STATE_MARK[session.state] ?? "·"} ${session.state}`, 13)}` +
        `${padStart(String(session.eventCount), 7)}  ${ago(session.startedAt)}`,
    );
  }

  rows.push("");
  return rows.join("\n");
}

/* -------------------------------------------------------------------------- */
/* dashboard                                                                  */
/* -------------------------------------------------------------------------- */

/** The platform command for "open this in the default application". */
function openCommand(url: string): { command: string; args: readonly string[] } {
  switch (process.platform) {
    case "win32":
      // `start` is a cmd builtin, and the empty string is the window title.
      // Without it a quoted URL is taken as the title and nothing opens.
      return { command: "cmd", args: ["/c", "start", "", url] };
    case "darwin":
      return { command: "open", args: [url] };
    default:
      return { command: "xdg-open", args: [url] };
  }
}

export interface DashboardOptions {
  readonly url?: string;
  /** Print the URL instead of launching a browser. */
  readonly print?: boolean;
  readonly open?: (url: string) => void;
}

export function openDashboard(options: DashboardOptions = {}): string {
  const url = options.url ?? process.env["OBSERVATORY_DASHBOARD"] ?? DEFAULT_DASHBOARD;
  if (options.print === true) return url;

  const launch =
    options.open ??
    ((target: string): void => {
      const { command, args } = openCommand(target);
      // Detached and unreferenced: the CLI should exit, not babysit a browser.
      const child = spawn(command, [...args], { detached: true, stdio: "ignore" });
      child.unref();
    });

  launch(url);
  return url;
}

/* -------------------------------------------------------------------------- */
/* doctor                                                                     */
/* -------------------------------------------------------------------------- */

export type CheckStatus = "ok" | "warn" | "fail";

export interface Check {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
  /** What to do about it. Present whenever the status is not `ok`. */
  readonly remedy?: string;
}

const MIN_NODE_MAJOR = 20;

function checkNode(): Check {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  return major >= MIN_NODE_MAJOR
    ? { name: "Node.js", status: "ok", detail: `${process.version} on ${platform()} ${arch()}` }
    : {
        name: "Node.js",
        status: "fail",
        detail: `${process.version} is too old`,
        remedy: `The Observatory needs Node ${MIN_NODE_MAJOR}.11 or newer.`,
      };
}

async function checkServer(client: ApiClient): Promise<readonly Check[]> {
  try {
    const health = await client.health();
    return [
      {
        name: "API server",
        status: "ok",
        detail: `${client.server} · ${health.database.sessions} sessions`,
      },
      { name: "Database", status: "ok", detail: health.database.location },
    ];
  } catch (error: unknown) {
    return [
      {
        name: "API server",
        status: error instanceof ServerUnreachableError ? "warn" : "fail",
        detail: `not reachable at ${client.server}`,
        remedy: "Start it with `observatory start`, or `npm run dev` for the dashboard too.",
      },
    ];
  }
}

async function checkDashboard(url: string): Promise<Check> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
    return response.ok
      ? { name: "Dashboard", status: "ok", detail: url }
      : {
          name: "Dashboard",
          status: "warn",
          detail: `${url} answered ${response.status}`,
          remedy: "Start it with `npm run dev:web`.",
        };
  } catch {
    return {
      name: "Dashboard",
      status: "warn",
      detail: `not reachable at ${url}`,
      remedy: "Start it with `npm run dev:web`. The CLI works without it.",
    };
  }
}

async function checkClaudeCode(home?: string): Promise<Check> {
  const found = await findTranscripts(home === undefined ? {} : { home });
  const newest = found[0];

  if (newest === undefined) {
    return {
      name: "Claude Code",
      status: "warn",
      detail: "no session transcripts found",
      remedy:
        "Run a Claude Code session; it writes a transcript under ~/.claude/projects as it works.",
    };
  }

  return {
    name: "Claude Code",
    status: "ok",
    detail: `${found.length} session${found.length === 1 ? "" : "s"}, newest ${ago(newest.modifiedAt)}`,
  };
}

/**
 * Codex is Phase 12.
 *
 * Reported as a gap rather than omitted: a doctor that lists only what works
 * tells you nothing about what does not.
 */
function checkCodex(): Check {
  return {
    name: "Codex",
    status: "warn",
    detail: "adapter not implemented (Phase 12)",
    remedy: "Codex rollout logs are readable in principle; nothing reads them yet.",
  };
}

async function checkWritable(location: string): Promise<Check> {
  const directory = dirname(location);
  try {
    await access(directory, constants.W_OK);
    return { name: "Data directory", status: "ok", detail: directory };
  } catch {
    return {
      name: "Data directory",
      status: "fail",
      detail: `${directory} is not writable`,
      remedy: "Point OBSERVATORY_DB somewhere writable.",
    };
  }
}

function checkScoring(): Check {
  const problems = validateScoringConfig(DEFAULT_SCORING_CONFIG);
  return problems.length === 0
    ? {
        name: "Scoring config",
        status: "ok",
        detail: `weights valid · ${Object.keys(DEFAULT_SCORING_CONFIG.health.weights).length} health components`,
      }
    : {
        name: "Scoring config",
        status: "fail",
        detail: problems.map((problem) => `${problem.group}: ${problem.message}`).join("; "),
        remedy: "Every weight group in packages/shared/src/scoring.ts must sum to 1.",
      };
}

function checkRedaction(): Check {
  const kinds = redactionKinds();
  return kinds.length > 0
    ? {
        name: "Secret redaction",
        status: "ok",
        detail: `${kinds.length} credential formats recognised`,
      }
    : {
        name: "Secret redaction",
        status: "fail",
        detail: "no patterns loaded",
        remedy: "packages/telemetry/src/redact.ts has no patterns.",
      };
}

export interface DoctorOptions extends CommandOptions {
  readonly dashboardUrl?: string;
  readonly home?: string;
}

/** Every check, in report order. Exposed so tests assert structure, not layout. */
export async function runChecks(options: DoctorOptions = {}): Promise<readonly Check[]> {
  const client = options.client ?? createApiClient(options.server);
  const serverChecks = await checkServer(client);
  const database = serverChecks.find((check) => check.name === "Database")?.detail;

  return [
    checkNode(),
    ...serverChecks,
    await checkDashboard(options.dashboardUrl ?? DEFAULT_DASHBOARD),
    await checkWritable(
      database === undefined || database === "memory" ? "data/observatory.db" : database,
    ),
    await checkClaudeCode(options.home),
    checkCodex(),
    checkScoring(),
    checkRedaction(),
  ];
}

const MARK: Record<CheckStatus, string> = { ok: "✓", warn: "⚠", fail: "✗" };

export async function doctorReport(options: DoctorOptions = {}): Promise<string> {
  const checks = await runChecks(options);

  const lines = [
    "",
    `  observatory doctor · v${OBSERVATORY_VERSION} · ${platform()} ${release()}`,
    "",
  ];

  for (const check of checks) {
    lines.push(`  ${MARK[check.status]} ${pad(check.name, 18)}${check.detail}`);
    if (check.remedy !== undefined) lines.push(`      ${check.remedy}`);
  }

  const failed = checks.filter((check) => check.status === "fail").length;
  const warned = checks.filter((check) => check.status === "warn").length;

  lines.push("");
  lines.push(
    failed > 0
      ? `  ${failed} problem${failed === 1 ? "" : "s"} to fix.`
      : warned > 0
        ? `  Everything essential works. ${warned} thing${warned === 1 ? "" : "s"} not set up.`
        : "  Everything checks out.",
  );
  lines.push("");

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* compare                                                                    */
/* -------------------------------------------------------------------------- */

/** Metrics reported as percentages rather than as 0-100 scores. */
const RATE_METRICS: ReadonlySet<string> = new Set([
  "successRate",
  "errorRate",
  "recoveryRate",
  "repetitionRate",
  "toolEfficiency",
]);

const METRIC_LABELS: Record<string, string> = {
  health: "Health",
  learning: "Learning",
  successRate: "Success rate",
  errorRate: "Error rate",
  recoveryRate: "Recovery rate",
  repetitionRate: "Repetition",
  toolEfficiency: "Tool efficiency",
};

function value(metric: string, raw: number | null): string {
  if (raw === null) return "n/a";
  return RATE_METRICS.has(metric) ? `${Math.round(raw * 100)}%` : String(Math.round(raw));
}

/**
 * The change, worded so the direction is unambiguous.
 *
 * An arrow alone is not enough: on error rate, "▲ -35 pts" has to be read as
 * "improved by 35 points", and every reader pauses on it. The word says it.
 */
function change(metric: string, delta: number | null, better: boolean | null): string {
  if (delta === null) return "";
  const size = RATE_METRICS.has(metric)
    ? `${delta > 0 ? "+" : ""}${Math.round(delta * 100)} pts`
    : `${delta > 0 ? "+" : ""}${Math.round(delta)}`;
  if (better === null) return `${size}  unchanged`;
  return `${size}  ${better ? "better" : "worse"}`;
}

export interface CompareOptions extends CommandOptions {
  readonly left?: string;
  readonly right?: string;
  readonly by?: string;
  readonly json?: boolean;
}

/**
 * `observatory compare` (BUILD.md section 65, V2).
 *
 * Two shapes: two sessions side by side, or every session grouped by model,
 * goal or source. The wording stays on "difference" throughout — grouping
 * sessions is observational, and the session count travels with every row so a
 * comparison drawn from one session each is visibly worth nothing.
 */
export async function compareReport(options: CompareOptions = {}): Promise<string> {
  const client = options.client ?? createApiClient(options.server);

  if (options.by !== undefined) {
    const result = await client.compareGroups(options.by);
    if (options.json === true) return JSON.stringify(result, null, 2);

    if (result.groups.length === 0) {
      return `\n  No sessions carry a ${options.by} to group by.\n`;
    }

    const lines = [
      "",
      `  Sessions grouped by ${result.groupBy}`,
      "",
      `  ${pad("GROUP", 34)}${padStart("N", 3)}${padStart("HEALTH", 8)}${padStart("LEARNING", 10)}` +
        `${padStart("SUCCESS", 9)}${padStart("RECOVERY", 10)}  STATES`,
    ];

    for (const group of result.groups) {
      const states = (["improving", "stable", "degrading"] as const)
        .map((state) => `${STATE_MARK[state] ?? ""}${group.states[state] ?? 0}`)
        .join(" ");
      lines.push(
        `  ${pad(group.key, 34)}${padStart(String(group.sessions), 3)}` +
          `${padStart(value("health", group.health), 8)}` +
          `${padStart(value("learning", group.learning), 10)}` +
          `${padStart(value("successRate", group.successRate), 9)}` +
          `${padStart(value("recoveryRate", group.recoveryRate), 10)}  ${states}`,
      );
    }

    lines.push("");
    if (result.ungrouped > 0) {
      lines.push(`  ${result.ungrouped} session(s) had no ${result.groupBy} and were left out.`);
    }
    lines.push("  Medians, not means. A group of one is a data point, not a comparison.");
    lines.push("");
    return lines.join("\n");
  }

  if (options.left === undefined || options.right === undefined) {
    throw new Error("compare needs either --by <model|goal|source>, or two session ids");
  }

  const result = await client.compareSessions(options.left, options.right);
  if (options.json === true) return JSON.stringify(result, null, 2);

  // Ids on their own lines: squeezing them into a 12-character column cut
  // `demo_degrading_BA7E` down to `ading_BA7E`, which identifies nothing.
  const lines = [
    "",
    `  left    ${result.left.session.id}   (${result.left.scores.state})`,
    `  right   ${result.right.session.id}   (${result.right.scores.state})`,
    "",
    `  ${pad("", 18)}${padStart("LEFT", 9)}${padStart("RIGHT", 9)}   CHANGE`,
  ];

  for (const delta of result.deltas) {
    lines.push(
      `  ${pad(METRIC_LABELS[delta.metric] ?? delta.metric, 18)}` +
        `${padStart(value(delta.metric, delta.left), 9)}` +
        `${padStart(value(delta.metric, delta.right), 9)}   ` +
        change(delta.metric, delta.delta, delta.better),
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
