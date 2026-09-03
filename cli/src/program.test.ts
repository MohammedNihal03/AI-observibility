import { describe, expect, it } from "vitest";

import { buildProgram } from "./program.js";

/**
 * The command surface of BUILD.md section 33, plus `import`.
 *
 * These drive the program the way a shell does, but with the output writer and
 * commander's exit behaviour injected, so nothing here spawns a process or
 * touches a real server.
 */

const SECTION_33_COMMANDS = ["start", "status", "sessions", "dashboard", "demo", "doctor"];

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

function run(args: string[]): string[] {
  return capture(args).out;
}

describe("observatory CLI", () => {
  it("registers every command required by BUILD.md section 33", () => {
    const names = buildProgram().commands.map((command) => command.name());
    for (const command of SECTION_33_COMMANDS) {
      expect(names).toContain(command);
    }
  });

  it("adds `import`, which section 33 does not specify", () => {
    // Reading a transcript an agent already wrote is a different job from the
    // six commands the spec lists, so it is an addition rather than a rename.
    expect(buildProgram().commands.map((command) => command.name())).toContain("import");
  });

  it("describes every command it offers", () => {
    for (const command of buildProgram().commands) {
      expect(command.description().length).toBeGreaterThan(10);
      expect(command.description()).not.toMatch(/not implemented/i);
    }
  });
});

describe("demo", () => {
  it("runs each scenario", () => {
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

describe("dashboard", () => {
  it("prints the URL instead of opening a browser when asked", () => {
    expect(run(["dashboard", "--print"]).join("")).toBe("http://127.0.0.1:4001");
  });

  it("accepts an explicit URL", () => {
    expect(run(["dashboard", "--print", "--url", "http://localhost:9999"]).join("")).toBe(
      "http://localhost:9999",
    );
  });
});
