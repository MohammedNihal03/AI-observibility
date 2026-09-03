import { describe, expect, it } from "vitest";

import { buildProgram, NotImplementedYetError } from "./program.js";

const EXPECTED_COMMANDS = ["start", "status", "sessions", "dashboard", "demo", "doctor"];
/** Everything except `demo`, which Phase 6 implemented. */
const PLANNED_COMMANDS = EXPECTED_COMMANDS.filter((command) => command !== "demo");

function run(args: string[]): string[] {
  return capture(args).out;
}

function capture(args: string[]): { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const program = buildProgram({ out: (text) => out.push(text) });

  // Subcommands do not inherit these once they exist, and an option error is
  // reported by the SUBCOMMAND - without this it would reach the real
  // process.exit instead of the test.
  for (const command of [program, ...program.commands]) {
    command.exitOverride();
    command.configureOutput({ writeOut: () => {}, writeErr: (text) => err.push(text) });
  }

  program.parse(["node", "observatory", ...args]);
  return { out, err };
}

describe("observatory CLI", () => {
  it("registers every command required by BUILD.md section 33", () => {
    const names = buildProgram()
      .commands.map((command) => command.name())
      .sort();
    expect(names).toEqual([...EXPECTED_COMMANDS].sort());
  });

  it("reports honestly that a command is not implemented yet", () => {
    for (const command of PLANNED_COMMANDS) {
      expect(() => run([command])).toThrow(NotImplementedYetError);
    }
  });

  it("runs each demo scenario", () => {
    for (const scenario of ["improving", "stable", "degrading"]) {
      const output = run(["demo", "--scenario", scenario]).join("\n");
      expect(output).toContain("SIMULATED DATA");
      expect(output).toContain(`demo_${scenario}_`);
    }
  });

  it("defaults to the improving scenario", () => {
    expect(run(["demo"]).join("\n")).toContain("demo_improving_");
  });

  it("rejects a scenario the generator does not have, and names the valid ones", () => {
    // exitOverride turns commander's exit into a throw rather than killing the
    // test process.
    const attempt = (): unknown => capture(["demo", "--scenario", "flaky"]);
    expect(attempt).toThrow(/flaky/);
    expect(attempt).toThrow(/improving, stable, degrading/);
  });

  it("emits JSON on request", () => {
    const output = run(["demo", "--scenario", "stable", "--json"]).join("\n");
    const parsed = JSON.parse(output) as { simulated: boolean; scores: { state: string } };
    expect(parsed.simulated).toBe(true);
    expect(parsed.scores.state).toBe("stable");
  });

  it("emits the raw events as NDJSON on request", () => {
    const lines = run(["demo", "--scenario", "degrading", "--events"]);
    expect(lines.length).toBeGreaterThan(50);
    for (const line of lines) {
      const event = JSON.parse(line) as { metadata?: Record<string, unknown> };
      expect(event.metadata?.["simulated"]).toBe(true);
    }
  });

  it("honours a fixed seed and start time", () => {
    const args = ["demo", "--seed", "fixed", "--started-at", "2026-05-01T08:00:00.000Z", "--json"];
    expect(run(args)).toEqual(run(args));
    expect(run(args).join("\n")).toContain("2026-05-01T08:00:00.000Z");
  });
});
