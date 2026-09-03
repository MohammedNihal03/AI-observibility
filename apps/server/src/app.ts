import cors from "@fastify/cors";
import { CONTRACT_VERSION, OBSERVATORY_VERSION } from "@observatory/shared";
import Fastify, { type FastifyInstance } from "fastify";

import { loadConfig, type ServerConfig } from "./config.js";
import { createDatabase, type DatabaseHandle } from "./db/client.js";
import { createStore, type Store } from "./db/store.js";

export interface HealthResponse {
  status: "ok";
  version: string;
  contractVersion: number;
  /** Server clock, ISO 8601. The dashboard uses it to detect clock skew. */
  time: string;
  uptimeSeconds: number;
  database: {
    /** "memory" for an ephemeral test database, otherwise the file path. */
    location: string;
    sessions: number;
  };
}

export interface CreateAppOptions {
  config?: ServerConfig;
  logger?: boolean;
  /**
   * An open database. When omitted the app opens the configured file and takes
   * responsibility for closing it. Tests pass an in-memory handle.
   */
  database?: DatabaseHandle;
}

declare module "fastify" {
  interface FastifyInstance {
    store: Store;
    database: DatabaseHandle;
  }
}

/**
 * Builds the Fastify instance without listening, so tests can drive it with
 * `app.inject(...)` and no open sockets.
 *
 * PHASE 3 (current): the database is opened, migrated and exposed as
 *                    `app.store`. Health reports it.
 * PHASE 7 adds: the REST routes of BUILD.md section 32 and the
 *               `WS /api/sessions/:id/stream` WebSocket hub (section 31).
 */
export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig();

  const app = Fastify({
    logger: options.logger ?? false,
    // Telemetry payloads are small; keep an explicit ceiling so a runaway
    // collector cannot exhaust memory (section 49).
    bodyLimit: 4 * 1024 * 1024,
  });

  const ownsDatabase = options.database === undefined;
  const database = options.database ?? createDatabase({ file: config.databaseFile });

  app.decorate("database", database);
  app.decorate("store", createStore(database.db));

  if (ownsDatabase) {
    app.addHook("onClose", () => {
      database.close();
    });
  }

  app.register(cors, { origin: [...config.allowedOrigins] });

  app.get("/api/health", async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      version: OBSERVATORY_VERSION,
      contractVersion: CONTRACT_VERSION,
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        location: database.file === ":memory:" ? "memory" : database.file,
        sessions: app.store.sessions.count(),
      },
    };
  });

  return app;
}
