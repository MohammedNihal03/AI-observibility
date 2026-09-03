import { analyzeSession, signalsFor, type BehaviorAnalysis } from "@observatory/behavior";
import { generateDemoSession, type DemoScenario, type DemoSession } from "@observatory/collectors";
import type { NormalizedAgentEvent, Reason } from "@observatory/shared";
import { createEventProcessor, fixedClock, sequentialIds } from "@observatory/telemetry";

/**
 * `observatory demo` (BUILD.md sections 33, 34, 59; Phase 6).
 *
 * The demo runs the REAL pipeline, not a shortcut around it: generated events
 * are validated, normalized and redacted by `@observatory/telemetry` and then
 * scored by `@observatory/behavior`, exactly as events arriving from Claude Code
 * will be. If the demo says a session is improving, the same code that will
 * judge a real session said so.
 *
 * Section 59's fuller list - persist the session, broadcast over WebSocket,
 * render it in the dashboard - needs the API (Phase 7) and the dashboard
 * (Phases 8-9). This phase covers steps 1 to 6 of that list locally, and prints
 * the result rather than pushing it anywhere.
 */

export interface DemoRunOptions {
  readonly scenario: DemoScenario;
  readonly seed?: string;
  /** ISO 8601. Defaults to the generator's fixed start, for reproducibility. */
  readonly startedAt?: string;
  readonly sessionId?: string;
}

export interface DemoRun {
  readonly demo: DemoSession;
  readonly events: readonly NormalizedAgentEvent[];
  readonly analysis: BehaviorAnalysis;
  /** Secrets removed on the way in. Always 0 here - a demo carries none. */
  readonly redactions: number;
}

export function runDemo(options: DemoRunOptions): DemoRun {
  const demo = generateDemoSession({
    scenario: options.scenario,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.startedAt !== undefined ? { startedAt: options.startedAt } : {}),
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
  });

  const processor = createEventProcessor({
    idFactory: sequentialIds(`${demo.sessionId}_e`),
    // Never consulted: every generated event carries its own timestamp. Fixed
    // anyway, so that nothing in this path can depend on the wall clock.
    now: fixedClock(demo.startedAt),
  });

  const processed = processor.ingestMany(demo.sessionId, demo.events);

  const events = processed.map((entry) => entry.event);
  const analysis = analyzeSession(events, {
    goal: { text: demo.goal, keywords: demo.goalKeywords },
    metrics: { context: { reportedMaximum: demo.contextWindow } },
  });

  return {
    demo,
    events,
    analysis,
    redactions: processed.reduce(
      (total, entry) => total + entry.redactions.reduce((sum, hit) => sum + hit.count, 0),
      0,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

const STATE_LABEL: Readonly<Record<string, string>> = {
  improving: "▲ IMPROVING",
  stable: "● STABLE",
  degrading: "▼ DEGRADING",
  insufficient_data: "· NOT ENOUGH DATA",
};

/** The behavioural engine's window labels, in order (section 21). */
const WINDOW_LABELS = ["early", "middle", "recent"] as const;

const REASON_MARK: Readonly<Record<Reason["type"], string>> = {
  positive: "✓",
  negative: "✗",
  warning: "⚠",
  neutral: "·",
};

function percent(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

function score(value: number | null): string {
  return value === null ? "n/a" : `${value} / 100`;
}

function count(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/u, "")}K`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/u, "")}M`;
}

function duration(ms: number | null): string {
  if (ms === null) return "n/a";
  const seconds = Math.round(ms / 1_000);
  const minutes = Math.floor(seconds / 60);
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

/**
 * The headline question of section 35: what is the agent doing, how healthy is
 * it, is it improving, and why.
 *
 * Every number printed here was measured. Nothing is rounded up to look better,
 * and an unmeasurable value prints as `n/a` rather than as a zero (section 30).
 */
export function formatDemoReport(run: DemoRun): string {
  const { demo, analysis } = run;
  const metrics = analysis.metrics;
  const lines: string[] = [];

  lines.push("");
  lines.push("  AI Agent Observatory — simulated session");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  lines.push("  SIMULATED DATA. Generated by `observatory demo`; not observed from");
  lines.push("  a real agent. Every event is flagged `simulated` in the store.");
  lines.push("");
  lines.push(`  Session    ${demo.sessionId} · ${demo.source} · ${demo.model}`);
  lines.push(`  Scenario   ${demo.scenario} (seed "${demo.seed}") — ${demo.headline}`);
  lines.push(`  Goal       ${demo.goal}`);
  lines.push(
    `  Span       ${duration(metrics.durationMs)} · ${run.events.length} events · ` +
      `${metrics.counters.totalToolCalls} actions`,
  );
  lines.push("");

  lines.push(
    `  AGENT HEALTH          ${pad(score(analysis.health.score), 10)} ${analysis.health.state}` +
      ` (${analysis.health.measuredComponents}/5 components measured)`,
  );
  lines.push(
    `  BEHAVIORAL LEARNING   ${pad(score(analysis.learning.score), 10)} ` +
      `${STATE_LABEL[analysis.currentState] ?? analysis.currentState}`,
  );
  lines.push(`  DEGRADATION           ${pad(score(analysis.degradation.score), 10)}`);
  lines.push("");

  lines.push(
    "  " +
      [
        `Tokens ${count(metrics.tokens.total)}`,
        `Tools ${metrics.counters.totalToolCalls}`,
        `Errors ${metrics.counters.errors}`,
        `Recovery ${percent(metrics.recoveryRate)}`,
        `Repetition ${percent(metrics.repetitionRate)}`,
        `Context ${percent(metrics.contextPressure)}`,
      ].join("   "),
  );
  lines.push("");

  // The script, so a reader can check the engine's verdict against what the
  // simulated agent was actually made to do.
  lines.push("  WHAT THE SIMULATED AGENT DID");
  demo.narrative.forEach((line, index) => {
    lines.push(`    ${pad(WINDOW_LABELS[index] ?? `phase ${index + 1}`, 8)}${line}`);
  });
  lines.push("");

  lines.push("  WINDOW      actions   errors   recovery   repetition   on-goal");
  for (const window of analysis.windows.windows) {
    lines.push(
      `  ${pad(window.label, 12)}${padStart(String(window.actions), 5)}` +
        `${padStart(percent(window.errorRate), 9)}` +
        `${padStart(percent(window.recoveryRate), 11)}` +
        `${padStart(percent(window.repetitionRate), 13)}` +
        `${padStart(percent(window.goalAdherence), 10)}`,
    );
  }
  lines.push("");

  const title =
    analysis.currentState === "insufficient_data"
      ? "WHY THERE IS NO VERDICT YET"
      : `WHY THE AGENT IS ${analysis.currentState.toUpperCase()}`;
  lines.push(`  ${title}`);
  if (analysis.reasons.length === 0) {
    lines.push("    · nothing measurable changed across the session");
  }
  for (const reason of analysis.reasons) {
    lines.push(`    ${REASON_MARK[reason.type]} ${reason.message}`);
  }
  lines.push("");

  const signals = signalsFor(demo.sessionId, analysis);
  if (signals.length > 0) {
    lines.push("  SIGNALS");
    for (const signal of signals) {
      lines.push(`    [${pad(signal.severity, 8)}] ${signal.message}`);
    }
    lines.push("");
  }

  lines.push("  Behavioral learning measures the agent's observable behavior in this session.");
  lines.push("  It is not model learning: no weights, gradients or loss are involved.");
  lines.push("");

  return lines.map((line) => line.trimEnd()).join("\n");
}

/** The machine-readable form of a demo run, for `--json` and for Phase 7. */
export function demoSummary(run: DemoRun): Record<string, unknown> {
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
      contextWindow: demo.contextWindow,
    },
    scores: {
      health: analysis.health.score,
      healthState: analysis.health.state,
      learning: analysis.learning.score,
      state: analysis.currentState,
      degradation: analysis.degradation.score,
    },
    metrics: analysis.metrics,
    counts: analysis.counts,
    windows: analysis.windows.windows,
    reasons: analysis.reasons,
    signals: signalsFor(demo.sessionId, analysis),
  };
}
