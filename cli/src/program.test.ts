import { describe, expect, it } from "vitest";

import { buildProgram, NotImplementedYetError } from "./program.js";

const EXPECTED_COMMANDS = ["start", "status", "sessions", "dashboard", "demo", "doctor"];

function run(args: string[]): void {
  const program = buildProgram();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  program.parse(["node", "observatory", ...args]);
}

describe("observatory CLI", () => {
  it("registers every command required by BUILD.md section 33", () => {
    const names = buildProgram()
      .commands.map((command) => command.name())
      .sort();
    expect(names).toEqual([...EXPECTED_COMMANDS].sort());
  });

  it("reports honestly that a command is not implemented yet", () => {
    for (const command of EXPECTED_COMMANDS) {
      expect(() => run([command])).toThrow(NotImplementedYetError);
    }
  });

  it("accepts the scenario option on demo", () => {
    expect(() => run(["demo", "--scenario", "degrading"])).toThrow(/not implemented yet/);
  });
});
