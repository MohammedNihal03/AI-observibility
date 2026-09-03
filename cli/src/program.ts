import { DEMO_SCENARIOS, isDemoScenario } from "@observatory/collectors";
import { OBSERVATORY_VERSION } from "@observatory/shared";
import { Command, InvalidArgumentError, Option } from "commander";

import { DEFAULT_SERVER } from "./api.js";
import { demoSummary, formatDemoReport, runDemo } from "./demo.js";
import { streamDemo } from "./stream.js";

/** Phase in which each command becomes functional (BUILD.md section 58). */
const PLANNED: Record<string, string> = {
  start: "Phase 10 (needs the API from Phase 7)",
  status: "Phase 10 (needs the API from Phase 7)",
  sessions: "Phase 10 (needs persistence from Phase 3)",
  dashboard: "Phase 10 (needs the dashboard from Phase 8)",
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

interface DemoCommandOptions {
  readonly scenario: string;
  readonly seed: string;
  readonly startedAt?: string;
  readonly json?: boolean;
  readonly events?: boolean;
  readonly stream?: boolean;
  readonly server: string;
  readonly speed: string;
}

export interface ProgramOptions {
  /** Where command output goes. Injected so tests do not have to trap stdout. */
  readonly out?: (text: string) => void;
}

/**
 * Builds the CLI. Exported separately from the entry point so tests can drive
 * it without spawning a process.
 */
export function buildProgram(options: ProgramOptions = {}): Command {
  const out = options.out ?? ((text: string): void => console.log(text));
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
    .description(
      "Generate a simulated agent session, analyze it, and print the result.\n" +
        "The data is synthetic and is labelled as such; no agent is observed.",
    )
    .addOption(
      new Option("-s, --scenario <scenario>", "which simulated session to generate")
        .choices([...DEMO_SCENARIOS])
        .default("improving"),
    )
    .option("--seed <seed>", "seed for deterministic generation", "observatory")
    .option("--started-at <iso>", "ISO timestamp the simulated session starts at")
    .option("--json", "print the analysis as JSON instead of a report")
    .option("--events", "print the generated events as NDJSON, one per line")
    .option("--stream", "replay the session into the running server, live")
    .option("--server <url>", "Observatory API to stream to", DEFAULT_SERVER)
    .option("--speed <factor>", "how much faster than real time to replay", "6")
    .action(async (commandOptions: DemoCommandOptions) => {
      // Belt and braces: commander's `choices` rejects an unknown scenario
      // before this runs, but the narrowing is what makes the type safe.
      if (!isDemoScenario(commandOptions.scenario)) {
        throw new InvalidArgumentError(
          `unknown scenario "${commandOptions.scenario}" - expected one of ${DEMO_SCENARIOS.join(", ")}`,
        );
      }

      if (commandOptions.stream === true) {
        const speed = Number.parseFloat(commandOptions.speed);
        if (!Number.isFinite(speed) || speed <= 0) {
          throw new InvalidArgumentError(`--speed must be a positive number, got "${commandOptions.speed}"`);
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
          },
        });

        out(
          `\nDone. ${result.sent} events in ${(result.elapsedMs / 1000).toFixed(1)}s ` +
            `as session ${result.sessionId}.`,
        );
        out("The data is simulated and is labelled as such in the dashboard.");
        return;
      }

      const run = runDemo({
        scenario: commandOptions.scenario,
        seed: commandOptions.seed,
        ...(commandOptions.startedAt !== undefined ? { startedAt: commandOptions.startedAt } : {}),
      });

      if (commandOptions.events === true) {
        for (const event of run.events) out(JSON.stringify(event));
        return;
      }

      out(
        commandOptions.json === true
          ? JSON.stringify(demoSummary(run), null, 2)
          : formatDemoReport(run),
      );
    });

  planned(program, "doctor", "Diagnose the local environment and agent integrations.");

  return program;
}
