import { OBSERVATORY_VERSION } from "@observatory/shared";
import { Command } from "commander";

/** Phase in which each command becomes functional (BUILD.md section 58). */
const PLANNED: Record<string, string> = {
  start: "Phase 10 (needs the API from Phase 7)",
  status: "Phase 10 (needs the API from Phase 7)",
  sessions: "Phase 10 (needs persistence from Phase 3)",
  dashboard: "Phase 10 (needs the dashboard from Phase 8)",
  demo: "Phase 6 (needs the demo generator)",
  doctor: "Phase 10",
};

export class NotImplementedYetError extends Error {
  constructor(readonly command: string) {
    super(
      `\`observatory ${command}\` is not implemented yet - scheduled for ${PLANNED[command] ?? "a later phase"}.\n` +
        `The command surface is wired up so that phases can land one at a time without changing the CLI contract.`,
    );
    this.name = "NotImplementedYetError";
  }
}

function planned(program: Command, name: string, description: string): Command {
  return program
    .command(name)
    .description(`${description} [not implemented yet - ${PLANNED[name]}]`)
    .action(() => {
      throw new NotImplementedYetError(name);
    });
}

/**
 * Builds the CLI. Exported separately from the entry point so tests can drive
 * it without spawning a process.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("observatory")
    .description(
      "AI Agent Observatory - local-first behavioral observability for AI coding agents.\n" +
        "Measures observable agent behavior. It does not measure model weights, gradients or loss.",
    )
    .version(OBSERVATORY_VERSION, "-v, --version");

  planned(program, "start", "Start the collector and API server.");
  planned(program, "status", "Show the status of the running observatory.");
  planned(program, "sessions", "List recorded sessions.");
  planned(program, "dashboard", "Open the dashboard in a browser.");

  program
    .command("demo")
    .description(`Generate a simulated session. [not implemented yet - ${PLANNED.demo}]`)
    .option("-s, --scenario <scenario>", "improving | stable | degrading", "improving")
    .option("--seed <seed>", "Seed for deterministic generation")
    .action(() => {
      throw new NotImplementedYetError("demo");
    });

  planned(program, "doctor", "Diagnose the local environment and agent integrations.");

  return program;
}
