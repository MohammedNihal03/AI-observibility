import type { FastifyInstance } from "fastify";

import { createApp, type CreateAppOptions } from "./app.js";
import { loadConfig, type ServerConfig } from "./config.js";

/**
 * Starting the server, as a function rather than a script.
 *
 * `observatory start` (BUILD.md section 33) needs to bring the API up from
 * inside another process, and a module whose only entry point is a side effect
 * cannot be reused - importing it would start a server. So the listening lives
 * here, `index.ts` is a thin wrapper for `node dist/index.js`, and the CLI calls
 * the same function the binary does. One implementation, two callers.
 */

export interface RunningServer {
  readonly app: FastifyInstance;
  readonly url: string;
  readonly config: ServerConfig;
  close(): Promise<void>;
}

export interface StartOptions extends CreateAppOptions {
  /** Overrides the configured port. Used by `observatory start --port`. */
  readonly port?: number;
  readonly host?: string;
}

export class PortInUseError extends Error {
  constructor(readonly url: string) {
    super(
      `Something is already listening on ${url}.\n` +
        `That is probably an Observatory server you already started - check with \`observatory status\`.\n` +
        `To run a second one, pass --port or set OBSERVATORY_PORT.`,
    );
    this.name = "PortInUseError";
  }
}

function isAddressInUse(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code === "EADDRINUSE"
    : false;
}

/** Brings the API up and resolves once it is accepting connections. */
export async function startServer(options: StartOptions = {}): Promise<RunningServer> {
  const base = options.config ?? loadConfig();
  const config: ServerConfig = {
    ...base,
    ...(options.host !== undefined ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
  };

  const app = createApp({ ...options, config });
  const url = `http://${config.host}:${config.port}`;

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error: unknown) {
    await app.close();
    // A port collision is the one startup failure with an obvious remedy, and
    // a Node stack trace is a poor way to communicate it.
    if (isAddressInUse(error)) throw new PortInUseError(url);
    throw error;
  }

  return {
    app,
    url,
    config,
    close: async (): Promise<void> => {
      await app.close();
    },
  };
}
