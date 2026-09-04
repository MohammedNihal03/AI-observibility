import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { CONTRACT_VERSION, OBSERVATORY_VERSION } from "@observatory/shared";
import Fastify, { type FastifyInstance } from "fastify";

import { loadConfig, type ServerConfig } from "./config.js";
import { createDatabase, type DatabaseHandle } from "./db/client.js";
import { createStore, type Store } from "./db/store.js";
import { createHub, type Hub } from "./hub.js";
import { registerRoutes } from "./routes.js";

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
  /** Dashboards currently attached to a session stream. */
  subscribers: number;
}

export interface CreateAppOptions {
  config?: ServerConfig;
  logger?: boolean;
  /**
   * An open database. When omitted the app opens the configured file and takes
   * responsibility for closing it. Tests pass an in-memory handle.
   */
  database?: DatabaseHandle;
  /** Clock, injected so tests can assert a fixed `computedAt`. */
  now?: () => Date;
  /**
   * A built dashboard to serve alongside the API.
   *
   * The packaged CLI passes the exported dashboard that ships inside it, so one
   * command and one port give a user both halves of the product. In development
   * it is absent and the dashboard runs on its own port under `next dev`.
   */
  dashboardDir?: string;
}

declare module "fastify" {
  interface FastifyInstance {
    store: Store;
    database: DatabaseHandle;
    hub: Hub;
  }
}

/**
 * Serves an exported dashboard from the API process.
 *
 * The export is plain files, so this is a static handler and a fallback: any
 * path that is not an API route and not a file on disk gets `index.html`, which
 * is how a client-rendered app survives someone reloading on `/compare`. API
 * routes keep their own 404 so a mistyped endpoint returns JSON rather than a
 * page of HTML.
 */
function registerDashboard(app: FastifyInstance, root: string): void {
  app.register(fastifyStatic, { root, wildcard: false });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "not_found" });
    }
    return reply.sendFile("index.html");
  });
}

/**
 * Builds the Fastify instance without listening, so tests can drive it with
 * `app.inject(...)` and no open sockets.
 *
 * The API, the WebSocket hub and - when a built dashboard is supplied - the
 * dashboard itself, all on one instance.
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

  const hub = createHub();

  app.decorate("database", database);
  app.decorate("store", createStore(database.db));
  app.decorate("hub", hub);

  if (ownsDatabase) {
    app.addHook("onClose", () => {
      database.close();
    });
  }

  app.register(cors, { origin: [...config.allowedOrigins] });
  app.register(websocket);

  if (options.dashboardDir !== undefined) {
    registerDashboard(app, options.dashboardDir);
  }

  // Routes are registered after the websocket plugin so `{ websocket: true }`
  // is understood by the time the stream route is declared.
  app.register(async (instance) => {
    registerRoutes(instance, { hub, ...(options.now !== undefined ? { now: options.now } : {}) });
  });

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
      subscribers: hub.subscriberCount(),
    };
  });

  return app;
}
