import { DEMO_SCENARIOS, isDemoScenario } from "@observatory/collectors";
import { OBSERVATORY_VERSION } from "@observatory/shared";
import { Command, InvalidArgumentError, Option } from "commander";

import { DEFAULT_SERVER } from "./api.js";
import { demoSummary, formatDemoReport, runDemo } from "./demo.js";
import { importClaudeCodeSession, listSessions } from "./import.js";
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
          throw new InvalidArgumentError(
            `--speed must be a positive number, got "${commandOptions.speed}"`,
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

  program
    .command("import")
    .description(
      "Observe a real Claude Code session by reading its local transcript.\n" +
        "Only the shape of the work is sent - paths, commands, outcomes, token counts.\n" +
        "File contents, command output and prompt text stay on your machine.",
    )
    .option("--list", "list the sessions that could be imported, newest first")
    .option("--session <id>", "import a specific Claude Code session id (prefix is enough)")
    .option("--file <path>", "import a specific transcript file")
    .option("--project <name>", "only look at project directories matching this")
    .option("--watch", "keep following the session as the agent works")
    .option("--include-sidechains", "include sub-agent work in the parent session")
    .option("--server <url>", "Observatory API to send to", DEFAULT_SERVER)
    .action(async (commandOptions: ImportCommandOptions) => {
      if (commandOptions.list === true) {
        const found = await listSessions({
          ...(commandOptions.project !== undefined ? { project: commandOptions.project } : {}),
        });

        if (found.length === 0) {
          out("No Claude Code transcripts found under ~/.claude/projects.");
          return;
        }

        out(`${found.length} session${found.length === 1 ? "" : "s"}, newest first:\n`);
        for (const entry of found) {
          const size = `${Math.max(1, Math.round(entry.sizeBytes / 1024))}KB`;
          out(
            `  ${entry.sessionId.slice(0, 8)}  ${entry.modifiedAt.slice(0, 19).replace("T", " ")}  ` +
              `${size.padStart(7)}  ${entry.project}`,
          );
        }
        return;
      }

      const result = await importClaudeCodeSession({
        ...(commandOptions.file !== undefined ? { file: commandOptions.file } : {}),
        ...(commandOptions.session !== undefined ? { sessionId: commandOptions.session } : {}),
        ...(commandOptions.project !== undefined ? { project: commandOptions.project } : {}),
        ...(commandOptions.includeSidechains === true ? { includeSidechains: true } : {}),
        ...(commandOptions.watch === true ? { watch: true } : {}),
        server: commandOptions.server,
        onProgress: out,
      });

      const { parsed } = result;
      out("");
      out(`Imported ${result.sent} events from ${result.file}`);
      out(
        `  session   ${result.sessionId}` +
          (result.alreadyStored > 0 ? ` (${result.alreadyStored} already stored)` : ""),
      );
      out(`  model     ${parsed.session.model ?? "unknown"}`);
      out(`  goal      ${parsed.session.goal ?? "not stated"}`);
      out(
        `  skipped   ${parsed.skipped} bookkeeping lines, ${parsed.malformed} unreadable, ` +
          `${parsed.duplicateUsage} duplicate usage blocks`,
      );
      if (result.redactions > 0) {
        out(`  redacted  ${result.redactions} secrets before storage`);
      }
      out("");
      out("Open the dashboard at http://127.0.0.1:4001 to see it.");
    });

  planned(program, "doctor", "Diagnose the local environment and agent integrations.");

  return program;
}
