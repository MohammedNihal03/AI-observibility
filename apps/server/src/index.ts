import { startServer } from "./start.js";

/**
 * The server binary. Everything it does lives in `start.ts`, so that
 * `observatory start` can do the same thing without spawning a process.
 */
async function main(): Promise<void> {
  const server = await startServer({ logger: true });

  const shutdown = (signal: string): void => {
    server.app.log.info({ signal }, "shutting down");
    void server.close().then(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  server.app.log.info(`observatory server listening on ${server.url}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
