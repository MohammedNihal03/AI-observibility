import type { ActionOutcome } from "./pairing.js";

/**
 * Repeated-strategy detection (BUILD.md section 65, V2).
 *
 * ## The gap this fills
 *
 * Repetition detection (section 15) compares single actions by exact
 * signature. It catches `npm test` run three times. It cannot catch this:
 *
 *     edit auth.ts -> npm test -- auth   (fails)
 *     edit user.ts -> npm test -- user   (fails)
 *     edit role.ts -> npm test -- role   (fails)
 *
 * Six actions, every signature distinct, repetition rate zero - and an agent
 * applying the same failing approach three times running. That is the pattern a
 * developer actually wants to be told about, and it is invisible to exact
 * matching.
 *
 * ## What "semantic" means here, honestly
 *
 * Not embeddings. Section 50 keeps the scoring path deterministic and
 * dependency-free, and a model download would break both. Instead each action
 * is GENERALIZED - the specific target is dropped, the shape is kept:
 *
 *     file_edit  src/auth/token.ts        ->  edit:src/auth
 *     tool_call  npm test -- auth         ->  run:npm test
 *     search     Grep "createStore"       ->  search:Grep
 *
 * Then repeated SEQUENCES of those generalizations are found. It is a coarser
 * comparison rather than a smarter one, which is a real limitation: two edits
 * in the same directory count as the same move even when they are unrelated.
 * The `GoalDriftDetector` pattern applies here too - a future embedding backend
 * can replace `generalize` without touching the sequence search.
 */

/** Shortest sequence that counts as a strategy. One action is repetition. */
const MIN_LENGTH = 2;
/** Longest sequence searched. Beyond this the patterns stop being strategies. */
const MAX_LENGTH = 6;
/** Occurrences before a sequence is reported. */
const MIN_OCCURRENCES = 2;

export interface RepeatedStrategy {
  /** The generalized steps, in order. */
  readonly steps: readonly string[];
  readonly length: number;
  readonly occurrences: number;
  /** Index of the first action of each occurrence, in the pair array. */
  readonly startIndices: readonly number[];
  /** Occurrences whose final action succeeded. */
  readonly succeeded: number;
  /** Occurrences whose final action failed. */
  readonly failed: number;
}

export interface StrategyResult {
  /** Repeated sequences, longest and most repeated first. */
  readonly repeated: readonly RepeatedStrategy[];
  /**
   * Repeated strategies that never once ended in success.
   *
   * The actionable subset: an approach tried repeatedly that has yet to work.
   */
  readonly unproductive: readonly RepeatedStrategy[];
  readonly longestStrategy: number;
  /** Fraction of actions inside at least one repeated strategy, 0-1 or null. */
  readonly coverage: number | null;
  readonly measuredActions: number;
}

export const EMPTY_STRATEGY: StrategyResult = {
  repeated: [],
  unproductive: [],
  longestStrategy: 0,
  coverage: null,
  measuredActions: 0,
};

/**
 * Commands that position a shell rather than do anything.
 *
 * Agents prefix almost everything with `cd <somewhere> &&`. Generalizing on the
 * first word therefore reduced an entire real session to one strategy - `cd` -
 * repeated 62 times, which is both useless and wrong. The work is whatever
 * comes after.
 */
const SHELL_PREAMBLE: ReadonlySet<string> = new Set([
  "cd",
  "pushd",
  "popd",
  "export",
  "set",
  "source",
  ".",
  "true",
]);

/** The part of a command line that represents actual work. */
function significantCommand(command: string): string {
  const segments = command
    .split(/&&|\|\||;|\|/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

  for (const segment of segments) {
    const words = segment.split(/\s+/u).filter((word) => !word.startsWith("-"));
    const program = words[0];
    if (program !== undefined && !SHELL_PREAMBLE.has(program)) {
      return words.slice(0, 2).join(" ");
    }
  }

  // Nothing but preamble. Keep the first segment rather than dropping the
  // action entirely - `cd` really was all the agent did.
  const first = segments[0] ?? command;
  return first
    .split(/\s+/u)
    .filter((word) => !word.startsWith("-"))
    .slice(0, 2)
    .join(" ");
}

/**
 * Reduces one action to the KIND of move it was.
 *
 * A path keeps its directory and loses its filename; a command keeps its
 * program and first subcommand and loses its arguments. Two edits in the same
 * module, or two `npm test` runs against different suites, become the same
 * move - which is the whole point.
 */
export function generalize(signature: string): string | null {
  const parts = signature.split("|");
  const type = parts[0] ?? "";

  // `cmd:` is the last field of a signature, and a command may itself contain
  // a pipe, so everything from `cmd:` onward is rejoined rather than taking a
  // single split fragment and silently losing `| head`.
  const commandAt = parts.findIndex((part) => part.startsWith("cmd:"));
  const command = commandAt === -1 ? undefined : parts.slice(commandAt).join("|").slice(4);
  if (command !== undefined && command !== "") {
    // `npm run build --silent` -> `npm run build`. Flags and paths are the
    // varying part; the program and its subcommand are the strategy.
    return `run:${significantCommand(command)}`;
  }

  const path = parts.find((part) => part.startsWith("path:"))?.slice(5);
  if (path !== undefined && path !== "") {
    const segments = path.split("/");
    const directory = segments.length > 1 ? segments.slice(0, -1).join("/") : ".";
    const verb = type === "file_read" ? "read" : "edit";
    return `${verb}:${directory}`;
  }

  const target = parts.find((part) => part.startsWith("target:"));
  if (target !== undefined) {
    const tool = parts.find((part) => part.startsWith("tool:"))?.slice(5) ?? "tool";
    return `search:${tool}`;
  }

  // Nothing identifying: excluded rather than lumped together, for the same
  // reason `isDiscriminating` excludes them from repetition.
  return null;
}

interface Occurrence {
  readonly start: number;
  readonly failed: boolean | null;
}

/**
 * Whether an action's outcome says anything about whether the strategy worked.
 *
 * Only commands do. A file read or edit reports success as soon as the file was
 * written, which is true and uninteresting: the question is whether the test
 * that followed passed.
 *
 * Judging an occurrence by its LAST action instead made the verdict depend on
 * where the window happened to start - `test -> read` looked successful and
 * `read -> test` looked failed, for the same loop.
 */
function isVerifiable(signature: string): boolean {
  return signature.includes("|cmd:");
}

/** The outcome of the last command inside a window, or null if it has none. */
function outcomeOfWindow(
  verifiable: readonly boolean[],
  outcomes: readonly (boolean | null)[],
  start: number,
  length: number,
): boolean | null {
  for (let offset = length - 1; offset >= 0; offset -= 1) {
    const index = start + offset;
    if (verifiable[index] === true) return outcomes[index] ?? null;
  }
  return null;
}

/** Non-overlapping occurrences of one sequence, scanned left to right. */
function findOccurrences(
  steps: readonly (string | null)[],
  outcomes: readonly (boolean | null)[],
  verifiable: readonly boolean[],
  pattern: readonly string[],
): readonly Occurrence[] {
  const found: Occurrence[] = [];
  let index = 0;

  while (index + pattern.length <= steps.length) {
    let matches = true;
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (steps[index + offset] !== pattern[offset]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      found.push({
        start: index,
        failed: outcomeOfWindow(verifiable, outcomes, index, pattern.length),
      });
      // Non-overlapping: an ABAB run is two ABs, not three overlapping ones.
      index += pattern.length;
    } else {
      index += 1;
    }
  }

  return found;
}

/**
 * Finds repeated sequences of generalized actions.
 *
 * Longest-first with subsumption: once `edit -> test -> edit` is reported at a
 * set of positions, the `edit -> test` inside it is not reported again. Without
 * that, one repeated strategy of length four produces six overlapping findings
 * and the panel becomes noise.
 */
export function detectStrategies(pairs: readonly ActionOutcome[]): StrategyResult {
  if (pairs.length < MIN_LENGTH * MIN_OCCURRENCES) return EMPTY_STRATEGY;

  const steps = pairs.map((pair) => generalize(pair.action.signature));
  const outcomes = pairs.map((pair) => pair.failed);
  const verifiable = pairs.map((pair) => isVerifiable(pair.action.signature));
  const measurable = steps.filter((step) => step !== null).length;

  const repeated: RepeatedStrategy[] = [];
  const claimed = new Set<number>();

  for (
    let length = Math.min(MAX_LENGTH, Math.floor(steps.length / 2));
    length >= MIN_LENGTH;
    length -= 1
  ) {
    const seen = new Set<string>();

    for (let start = 0; start + length <= steps.length; start += 1) {
      const window = steps.slice(start, start + length);
      if (window.some((step) => step === null)) continue;

      const pattern = window as string[];
      const key = pattern.join(">");
      if (seen.has(key)) continue;
      seen.add(key);

      const occurrences = findOccurrences(steps, outcomes, verifiable, pattern);
      if (occurrences.length < MIN_OCCURRENCES) continue;

      // Skip a sequence whose every position is already inside a longer one.
      const fresh = occurrences.filter((occurrence) => {
        for (let offset = 0; offset < length; offset += 1) {
          if (!claimed.has(occurrence.start + offset)) return true;
        }
        return false;
      });
      if (fresh.length < MIN_OCCURRENCES) continue;

      for (const occurrence of occurrences) {
        for (let offset = 0; offset < length; offset += 1) claimed.add(occurrence.start + offset);
      }

      repeated.push({
        steps: pattern,
        length,
        occurrences: occurrences.length,
        startIndices: occurrences.map((occurrence) => occurrence.start),
        succeeded: occurrences.filter((occurrence) => occurrence.failed === false).length,
        failed: occurrences.filter((occurrence) => occurrence.failed === true).length,
      });
    }
  }

  repeated.sort(
    (a, b) =>
      b.length * b.occurrences - a.length * a.occurrences ||
      b.occurrences - a.occurrences ||
      a.startIndices[0]! - b.startIndices[0]!,
  );

  // "Never worked" needs a failure on record. A strategy whose outcomes were
  // never reported is unknown, not unproductive.
  const unproductive = repeated.filter(
    (strategy) => strategy.succeeded === 0 && strategy.failed >= MIN_OCCURRENCES,
  );

  return {
    repeated,
    unproductive,
    longestStrategy: repeated.reduce((longest, strategy) => Math.max(longest, strategy.length), 0),
    coverage: measurable === 0 ? null : Math.min(1, claimed.size / measurable),
    measuredActions: measurable,
  };
}

/**
 * A readable rendering of a strategy, for a signal message.
 *
 * The verb is kept. Stripping it turned `run:npm test → read:docs` into
 * "npm test → docs", which reads as a command with an argument rather than two
 * steps.
 */
export function describeStrategy(strategy: RepeatedStrategy): string {
  return strategy.steps
    .map((step) => {
      const separator = step.indexOf(":");
      if (separator === -1) return step;
      const verb = step.slice(0, separator);
      const subject = step.slice(separator + 1);
      return verb === "run" ? subject : `${verb} ${subject}`;
    })
    .join(" → ");
}
