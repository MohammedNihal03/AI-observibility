import type { AgentEventInput, AgentSource } from "@observatory/shared";

/**
 * The demo generator (BUILD.md sections 34, 57; Phase 6).
 *
 * Section 34: "This is REQUIRED. Create realistic simulated sessions. The
 * dashboard must be impressive even without Claude Code or Codex."
 *
 * ## Simulated, and labelled as such
 *
 * Nothing here is observed telemetry, and the product must never let a viewer
 * think otherwise. Three mechanisms say so, at three different layers:
 *
 * - the session id always starts with `demo_`,
 * - every generated event carries `metadata.simulated = true` and the scenario
 *   that produced it,
 * - `DemoSession.simulated` is `true` for any consumer that would rather check a
 *   field than parse an id.
 *
 * The `source` still defaults to `claude_code`, because the point of the demo is
 * to show what observing Claude Code looks like. The flags above are what keep
 * that from being a lie.
 *
 * ## Determinism, and what the seed is allowed to change
 *
 * Section 57 requires the generator to be deterministic given a fixed seed, so
 * that the three scenarios can be tested reliably. This implementation goes one
 * step further: the seed may only change SURFACE DETAIL - which files are
 * touched, which test command is run, how many milliseconds pass between events.
 * The behavioural SKELETON of each scenario (how many failures, whether a file
 * was edited between a failure and its retry, how the three phases differ) is
 * fixed in the script below.
 *
 * That separation is deliberate. If the seed could move the structure, the
 * classification would be a matter of luck, and "improving" would sometimes come
 * out stable. Because the seed only permutes names, EVERY seed produces the same
 * three states - which is what the tests assert.
 *
 * ## How the scenarios were designed
 *
 * The behavioural engine splits a session into three windows by ACTION COUNT and
 * compares them (section 21). Each scenario therefore has exactly three phases
 * of exactly `ACTIONS_PER_PHASE` actions, so one phase lands in one window and
 * the narrative the phases tell is the trend the engine measures. Nothing in
 * here is tuned against the scoring weights; the phases describe agent behavior
 * and the scores follow from it.
 */

export const DEMO_SCENARIOS = ["improving", "stable", "degrading"] as const;
export type DemoScenario = (typeof DEMO_SCENARIOS)[number];

export function isDemoScenario(value: string): value is DemoScenario {
  return (DEMO_SCENARIOS as readonly string[]).includes(value);
}

/** Actions per phase. Three phases, so a phase maps onto exactly one window. */
const ACTIONS_PER_PHASE = 12;

/** Window labels from `@observatory/behavior`, attached for the timeline. */
const PHASE_LABELS = ["early", "middle", "recent"] as const;

const DEFAULT_SEED = "observatory";
const DEFAULT_MODEL = "claude-opus-5";
/** Context window the simulated agent reports, in tokens. */
const DEFAULT_CONTEXT_WINDOW = 200_000;
/** Fixed default start, so a call with no options is byte-for-byte reproducible. */
export const DEFAULT_DEMO_START = "2026-09-03T13:02:00.000Z";

const GOAL_TEXT = "Fix the failing auth token refresh tests";
const GOAL_KEYWORDS: readonly string[] = ["auth", "token", "refresh", "session"];

/**
 * Name pools.
 *
 * Slots in the scripts (`f0`, `t2`, `u1`, ...) are indices into these; a seeded
 * rotation maps them to concrete names. Rotation is a bijection, so distinct
 * slots always resolve to distinct names and the repetition structure of a
 * script is preserved for every seed.
 *
 * Goal adherence is measured lexically (section 28), so the split matters: every
 * `f`/`t` name mentions the goal's subject and no `u`/`n` name does. A scenario
 * that drifts off task drifts by touching `u` files and running `n` commands.
 */
const RELATED_FILES: readonly string[] = [
  "src/auth/token-refresh.ts",
  "src/auth/session-store.ts",
  "tests/auth/token-refresh.test.ts",
  "src/auth/client.ts",
  "src/auth/middleware.ts",
  "tests/auth/session-store.test.ts",
  "src/auth/refresh-queue.ts",
  "src/auth/token-store.ts",
  "tests/auth/client.test.ts",
];

const UNRELATED_FILES: readonly string[] = [
  "src/ui/settings-panel.tsx",
  "docs/CHANGELOG.md",
  "src/lib/date-format.ts",
  "src/ui/theme.ts",
];

const RELATED_COMMANDS: readonly string[] = [
  "npm test -- auth",
  "npx vitest run tests/auth/token-refresh.test.ts",
  "npm run test:unit -- token-refresh",
  "npx vitest run tests/auth/session-store.test.ts",
  "npm test -- session",
  "npm run test:integration -- auth",
];

/** Checks unrelated to the goal. These are allowed to fail. */
const NEUTRAL_COMMANDS: readonly string[] = ["npm run typecheck", "npm run lint", "npm run build"];

/**
 * Inspection commands, kept in their own pool because the scripts only ever run
 * them successfully. Rotating them together with the checks above eventually
 * produced a session in which `git diff --stat` failed twice in a row, which no
 * developer would believe for a moment.
 */
const INSPECTION_COMMANDS: readonly string[] = ["git diff --stat", "git status --short"];

/* -------------------------------------------------------------------------- */
/* Scenario scripts                                                           */
/* -------------------------------------------------------------------------- */

interface ReadStep {
  readonly act: "read";
  readonly slot: string;
}
interface EditStep {
  readonly act: "edit";
  readonly slot: string;
}
interface RunStep {
  readonly act: "run";
  readonly slot: string;
  readonly ok: boolean;
}
type Step = ReadStep | EditStep | RunStep;

const read = (slot: string): ReadStep => ({ act: "read", slot });
const edit = (slot: string): EditStep => ({ act: "edit", slot });
const pass = (slot: string): RunStep => ({ act: "run", slot, ok: true });
const fail = (slot: string): RunStep => ({ act: "run", slot, ok: false });

interface ScenarioScript {
  /** One line describing what the simulated agent did, shown by the CLI. */
  readonly headline: string;
  /** What happens in each phase, in the same order as `phases`. */
  readonly narrative: readonly [string, string, string];
  /** Context utilization at the first and last model turn, 0-1. */
  readonly contextStart: number;
  readonly contextPeak: number;
  readonly phases: readonly [readonly Step[], readonly Step[], readonly Step[]];
}

/**
 * Section 34's improving scenario: initial failures, investigation, successful
 * recovery, decreasing repetition, increasing success, fewer corrections.
 *
 * Note what the early phase does NOT contain: a third consecutive failure of the
 * same command. Two is thrashing worth showing; three would raise a critical
 * `repeated_failed_action` signal, and a session flagged critical while being
 * presented as the healthy example would be incoherent.
 */
const IMPROVING: ScenarioScript = {
  headline: "an agent that starts by thrashing, works out the problem, and converges",
  narrative: [
    "blind retry of a failing test, then two unresolved failures",
    "investigates, edits, and recovers from every failure",
    "one hiccup, immediately corrected; mostly first-time passes",
  ],
  contextStart: 0.11,
  contextPeak: 0.38,
  phases: [
    [
      read("f0"),
      fail("t0"),
      fail("t0"), // retried with nothing changed in between - a blind retry
      read("f1"),
      edit("f0"),
      fail("n0"),
      read("f0"),
      edit("f0"),
      read("f1"),
      pass("g0"),
      read("f2"),
      pass("n1"),
    ],
    [
      read("f3"),
      edit("f0"),
      pass("t0"), // the edit above closes the episode opened in the early phase
      fail("t1"),
      read("f1"),
      edit("f1"),
      pass("t1"), // failure -> investigation -> edit -> retry -> pass
      fail("n0"),
      read("f2"),
      edit("f2"),
      pass("n0"),
      pass("t2"),
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
      pass("n1"),
    ],
  ],
};

/**
 * Section 34's stable scenario: consistent performance, occasional errors,
 * successful recovery, no significant trend.
 *
 * The three phases are structurally IDENTICAL - same shape, same outcome
 * positions, same number of repeats - and differ only in which files and
 * commands they touch. Every window therefore measures the same rates, every
 * trend is exactly zero, and the session is stable by construction rather than
 * by hoping three hand-written phases happen to average out.
 */
const STABLE_PHASE = (
  a: string,
  b: string,
  c: string,
  ca: string,
  cb: string,
  cn: string,
): Step[] => [
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
  pass(ca),
];

const STABLE: ScenarioScript = {
  headline: "an agent working steadily: one failure per stretch, corrected each time",
  narrative: [
    "one failed check, investigated and fixed",
    "same rhythm on a different part of the code",
    "same rhythm again - no trend in either direction",
  ],
  contextStart: 0.18,
  contextPeak: 0.55,
  phases: [
    STABLE_PHASE("f0", "f1", "f2", "t0", "t1", "n0"),
    STABLE_PHASE("f3", "f4", "f5", "t2", "t3", "n1"),
    STABLE_PHASE("f6", "f7", "f8", "t4", "t5", "n2"),
  ],
};

/**
 * Section 34's degrading scenario: repeated commands, repeated failures,
 * increasing corrections, lower recovery, increasing context pressure.
 *
 * The middle and recent phases also wander off the stated goal - unrelated files
 * and unrelated commands - which is what the goal-drift detector is there to
 * notice (section 28).
 */
const DEGRADING: ScenarioScript = {
  headline: "an agent that starts well, gets stuck, and never recovers",
  narrative: [
    "competent: one failure, corrected on the next attempt",
    "the same test fails four times; edits stop helping",
    "still failing, now editing files unrelated to the goal",
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
      pass("n1"),
    ],
    [
      fail("t1"),
      edit("f0"),
      fail("t1"), // edited, still failing: a failed correction loop
      read("f0"),
      fail("t1"), // read something, changed nothing, ran it again: a blind retry
      read("u0"),
      fail("n1"),
      edit("u0"),
      fail("n1"),
      read("f1"),
      fail("t1"),
      read("u1"),
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
      read("u0"),
    ],
  ],
};

const SCRIPTS: Readonly<Record<DemoScenario, ScenarioScript>> = {
  improving: IMPROVING,
  stable: STABLE,
  degrading: DEGRADING,
};

/* -------------------------------------------------------------------------- */
/* Seeded randomness                                                          */
/* -------------------------------------------------------------------------- */

/** FNV-1a over the seed string, so any seed - number or text - is usable. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * mulberry32: a small, fast, well-distributed PRNG.
 *
 * Deliberately not `Math.random`: section 57 needs the same seed to produce the
 * same session on every machine and every run, which a shared global generator
 * cannot promise.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function rotate(pool: readonly string[], index: number, offset: number): string {
  const value = pool[(index + offset) % pool.length];
  // Unreachable - the modulo keeps the index in range - but `pool[i]` is
  // `string | undefined` under noUncheckedIndexedAccess and a silent "" here
  // would corrupt every signature in the session.
  if (value === undefined) throw new Error(`demo name pool is empty (index ${index})`);
  return value;
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

export interface DemoOptions {
  readonly scenario: DemoScenario;
  /** Anything stringifiable. The same seed always produces the same session. */
  readonly seed?: string | number;
  readonly sessionId?: string;
  readonly source?: AgentSource;
  readonly model?: string;
  /** ISO 8601. Defaults to `DEFAULT_DEMO_START`. */
  readonly startedAt?: string;
  readonly contextWindow?: number;
}

export interface DemoSession {
  readonly scenario: DemoScenario;
  readonly seed: string;
  readonly sessionId: string;
  readonly source: AgentSource;
  readonly model: string;
  readonly goal: string;
  readonly goalKeywords: readonly string[];
  readonly startedAt: string;
  readonly endedAt: string;
  /**
   * The context window the simulated agent reported. Pass it to the metrics
   * engine as `context.reportedMaximum` - context pressure is unmeasurable
   * without it, and the Observatory never guesses one (section 29).
   */
  readonly contextWindow: number;
  /** What the scenario is meant to look like, for the CLI and the dashboard. */
  readonly headline: string;
  readonly narrative: readonly string[];
  /** Always true. This session was generated, not observed. */
  readonly simulated: true;
  readonly events: readonly AgentEventInput[];
}

interface Names {
  readonly relatedFile: number;
  readonly unrelatedFile: number;
  readonly relatedCommand: number;
  readonly neutralCommand: number;
  readonly inspectionCommand: number;
}

function resolveFile(slot: string, offsets: Names): string {
  const index = Number.parseInt(slot.slice(1), 10);
  return slot.startsWith("u")
    ? rotate(UNRELATED_FILES, index, offsets.unrelatedFile)
    : rotate(RELATED_FILES, index, offsets.relatedFile);
}

function resolveCommand(slot: string, offsets: Names): string {
  const index = Number.parseInt(slot.slice(1), 10);
  if (slot.startsWith("n")) return rotate(NEUTRAL_COMMANDS, index, offsets.neutralCommand);
  if (slot.startsWith("g")) return rotate(INSPECTION_COMMANDS, index, offsets.inspectionCommand);
  return rotate(RELATED_COMMANDS, index, offsets.relatedCommand);
}

/**
 * Generates one simulated session.
 *
 * Returns event INPUTS, exactly as a real collector would hand them to the
 * ingestion pipeline: no ids, and no assumption that the caller will not
 * validate, normalize and redact them like any other event.
 */
export function generateDemoSession(options: DemoOptions): DemoSession {
  const script = SCRIPTS[options.scenario];
  const seed = String(options.seed ?? DEFAULT_SEED);
  const hash = hashSeed(`${options.scenario}:${seed}`);
  const random = mulberry32(hash);

  const offsets: Names = {
    relatedFile: Math.floor(random() * RELATED_FILES.length),
    unrelatedFile: Math.floor(random() * UNRELATED_FILES.length),
    relatedCommand: Math.floor(random() * RELATED_COMMANDS.length),
    neutralCommand: Math.floor(random() * NEUTRAL_COMMANDS.length),
    inspectionCommand: Math.floor(random() * INSPECTION_COMMANDS.length),
  };

  const source = options.source ?? "claude_code";
  const model = options.model ?? DEFAULT_MODEL;
  const contextWindow = options.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const sessionId =
    options.sessionId ??
    `demo_${options.scenario}_${hash.toString(16).toUpperCase().padStart(8, "0").slice(0, 4)}`;

  const startedAt = options.startedAt ?? DEFAULT_DEMO_START;
  let cursor = Date.parse(startedAt);
  if (Number.isNaN(cursor)) {
    throw new Error(`generateDemoSession: startedAt is not a valid ISO timestamp: ${startedAt}`);
  }

  const events: AgentEventInput[] = [];
  let callSequence = 0;
  let turn = 0;

  /** One model turn per this many actions, so context grows across the session. */
  const ACTIONS_PER_TURN = 4;
  const turns = (ACTIONS_PER_PHASE * 3) / ACTIONS_PER_TURN;

  const gap = (minMs: number, maxMs: number): number =>
    minMs + Math.floor(random() * (maxMs - minMs + 1));

  const advance = (minMs: number, maxMs: number): string => {
    cursor += gap(minMs, maxMs);
    return new Date(cursor).toISOString();
  };

  const push = (
    event: Omit<AgentEventInput, "source" | "sessionId" | "timestamp">,
    timestamp: string,
    phase: string,
    extraMetadata: Record<string, unknown> = {},
  ): void => {
    events.push({
      ...event,
      sessionId,
      source,
      timestamp,
      metadata: {
        ...event.metadata,
        ...extraMetadata,
        simulated: true,
        scenario: options.scenario,
        phase,
      },
    });
  };

  push(
    { type: "session_started", metadata: { model, contextWindow, goal: GOAL_TEXT } },
    new Date(cursor).toISOString(),
    PHASE_LABELS[0],
  );
  push({ type: "user_message" }, advance(400, 1_200), PHASE_LABELS[0]);

  const succeeded: { status: "success"; exitCode: 0; confidence: "reported" } = {
    status: "success",
    exitCode: 0,
    confidence: "reported",
  };

  script.phases.forEach((steps, phaseIndex) => {
    const phase = PHASE_LABELS[phaseIndex] ?? `phase_${phaseIndex + 1}`;

    steps.forEach((step, stepIndex) => {
      // A model turn precedes each group of actions. Its token counts are what
      // makes context pressure measurable; `input + cached` is the live context
      // the model was handed, which is the quantity section 29 reports.
      if (stepIndex % ACTIONS_PER_TURN === 0) {
        const progress = turns === 1 ? 1 : turn / (turns - 1);
        const live = Math.round(
          contextWindow *
            (script.contextStart + (script.contextPeak - script.contextStart) * progress),
        );
        const cached = Math.round(live * 0.72);
        push(
          {
            type: "model_response",
            tokens: { input: live - cached, output: gap(180, 900), cached },
          },
          advance(900, 3_000),
          phase,
          { turn: turn + 1 },
        );
        turn += 1;
      }

      if (step.act === "read") {
        push(
          {
            type: "file_read",
            tool: { name: "Read" },
            files: { path: resolveFile(step.slot, offsets) },
            result: succeeded,
          },
          advance(700, 2_400),
          phase,
        );
        return;
      }

      if (step.act === "edit") {
        push(
          {
            type: "file_edit",
            tool: { name: "Edit" },
            files: { path: resolveFile(step.slot, offsets) },
            result: succeeded,
          },
          advance(1_500, 6_000),
          phase,
        );
        return;
      }

      callSequence += 1;
      const callId = `call_${String(callSequence).padStart(3, "0")}`;
      const command = resolveCommand(step.slot, offsets);
      const durationMs = gap(1_200, 9_000);

      push({ type: "tool_call", tool: { name: "Bash", command } }, advance(600, 2_500), phase, {
        callId,
      });
      push(
        {
          type: "tool_result",
          tool: { name: "Bash", command },
          result: step.ok
            ? { ...succeeded, durationMs }
            : { status: "error", exitCode: 1, durationMs, confidence: "reported" },
        },
        advance(durationMs, durationMs),
        phase,
        { callId },
      );
    });
  });

  push({ type: "session_ended" }, advance(800, 2_000), PHASE_LABELS[2]);

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
    events,
  };
}

/** Actions a generated session contains, for callers that need to size a UI. */
export const DEMO_ACTION_COUNT = ACTIONS_PER_PHASE * 3;
