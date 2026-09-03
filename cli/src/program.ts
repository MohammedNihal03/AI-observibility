import { DEMO_SCENARIOS, isDemoScenario } from "@observatory/collectors";
import { OBSERVATORY_VERSION } from "@observatory/shared";
import { Command, InvalidArgumentError, Option } from "commander";

import { DEFAULT_SERVER } from "./api.js";
import {
  compareReport,
  doctorReport,
  openDashboard,
  sessionsReport,
  statusReport,
} from "./commands.js";
import { demoSummary, formatDemoReport, runDemo } from "./demo.js";
import { importClaudeCodeSession, listSessions } from "./import.js";
import { streamDemo } from "./stream.js";

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

interface StartCommandOptions {
  readonly port?: string;
  readonly host?: string;
  readonly quiet?: boolean;
}

interface SessionsCommandOptions {
  readonly server: string;
  readonly json?: boolean;
  readonly limit?: string;
}

interface DashboardCommandOptions {
  readonly url?: string;
  readonly print?: boolean;
}

interface CompareCommandOptions {
  readonly by?: string;
  readonly server: string;
  readonly json?: boolean;
}

interface DoctorCommandOptions {
  readonly server: string;
  readonly dashboard?: string;
}

interface ImportCommandOptions {
  readonly list?: boolean;
  readonly session?: string;
  readonly file?: string;
  readonly project?: string;
  readonly watch?: boolean;
  readonly includeSidechains?: boolean;
  readonly server: string;
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

  program
    .command("start")
    .description("Start the local API server. Runs until interrupted.")
    .option("-p, --port <port>", "port to listen on")
    .option("--host <host>", "interface to bind (loopback by default)")
    .option("--quiet", "suppress request logging")
    .action(async (commandOptions: StartCommandOptions) => {
      // Imported lazily: the server pulls in SQLite and Fastify, and
      // `observatory sessions` should not pay for them.
      const { startServer } = await import("@observatory/server");

      const port =
        commandOptions.port === undefined ? undefined : Number.parseInt(commandOptions.port, 10);
      if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
        throw new InvalidArgumentError(`--port must be a number between 1 and 65535`);
      }

      const server = await startServer({
        logger: commandOptions.quiet !== true,
        ...(port !== undefined ? { port } : {}),
        ...(commandOptions.host !== undefined ? { host: commandOptions.host } : {}),
      });

      out(`Observatory API listening on ${server.url}`);
      out(`Database ${server.app.database.file}`);
      out("");
      out("  observatory demo --stream    generate a simulated session");
      out("  observatory import           observe a real Claude Code session");
      out("  observatory dashboard        open the dashboard");
      out("");
      out("Press Ctrl+C to stop.");

      // Resolving here would end the process and take the server with it.
      await new Promise<void>((resolve) => {
        const stop = (): void => {
          out("\nStopping.");
          void server.close().then(resolve);
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
    });

  program
    .command("status")
    .description("Show what the local Observatory is doing.")
    .option("--server <url>", "Observatory API", DEFAULT_SERVER)
    .action(async (commandOptions: { server: string }) => {
      out(await statusReport({ server: commandOptions.server }));
    });

  program
    .command("sessions")
    .description("List recorded sessions with their headline scores.")
    .option("--server <url>", "Observatory API", DEFAULT_SERVER)
    .option("--json", "print the raw list as JSON")
    .option("-n, --limit <count>", "how many to show")
    .action(async (commandOptions: SessionsCommandOptions) => {
      const limit =
        commandOptions.limit === undefined ? undefined : Number.parseInt(commandOptions.limit, 10);
      out(
        await sessionsReport({
          server: commandOptions.server,
          ...(commandOptions.json === true ? { json: true } : {}),
          ...(limit !== undefined && Number.isInteger(limit) ? { limit } : {}),
        }),
      );
    });

  program
    .command("dashboard")
    .description("Open the dashboard in a browser.")
    .option("--url <url>", "dashboard address")
    .option("--print", "print the URL instead of opening it")
    .action((commandOptions: DashboardCommandOptions) => {
      const url = openDashboard({
        ...(commandOptions.url !== undefined ? { url: commandOptions.url } : {}),
        ...(commandOptions.print === true ? { print: true } : {}),
      });
      out(commandOptions.print === true ? url : `Opening ${url}`);
    });

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

  program
    .command("compare")
    .description(
      "Compare two sessions, or every session grouped by model, goal or source.\n" +
        "Grouped comparison is observational: it shows differences, not causes.",
    )
    .argument("[left]", "session id to compare from")
    .argument("[right]", "session id to compare to")
    .addOption(
      new Option("--by <key>", "group every session instead of comparing two").choices([
        "model",
        "goal",
        "source",
      ]),
    )
    .option("--server <url>", "Observatory API", DEFAULT_SERVER)
    .option("--json", "print the raw comparison as JSON")
    .action(
      async (
        left: string | undefined,
        right: string | undefined,
        commandOptions: CompareCommandOptions,
      ) => {
        if (commandOptions.by === undefined && (left === undefined || right === undefined)) {
          throw new InvalidArgumentError(
            "pass two session ids, or --by model|goal|source to group them",
          );
        }

        out(
          await compareReport({
            server: commandOptions.server,
            ...(commandOptions.by !== undefined ? { by: commandOptions.by } : {}),
            ...(left !== undefined ? { left } : {}),
            ...(right !== undefined ? { right } : {}),
            ...(commandOptions.json === true ? { json: true } : {}),
          }),
        );
      },
    );

  program
    .command("doctor")
    .description("Check the local environment and agent integrations.")
    .option("--server <url>", "Observatory API", DEFAULT_SERVER)
    .option("--dashboard <url>", "dashboard address")
    .action(async (commandOptions: DoctorCommandOptions) => {
      out(
        await doctorReport({
          server: commandOptions.server,
          ...(commandOptions.dashboard !== undefined
            ? { dashboardUrl: commandOptions.dashboard }
            : {}),
        }),
      );
    });

  return program;
}
