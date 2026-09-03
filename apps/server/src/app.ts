import cors from "@fastify/cors";
import { CONTRACT_VERSION, OBSERVATORY_VERSION } from "@observatory/shared";
import Fastify, { type FastifyInstance } from "fastify";

import { loadConfig, type ServerConfig } from "./config.js";

export interface HealthResponse {
  status: "ok";
  version: string;
  contractVersion: number;
  /** Server clock, ISO 8601. The dashboard uses it to detect clock skew. */
  time: string;
  uptimeSeconds: number;
}

export interface CreateAppOptions {
  config?: ServerConfig;
  logger?: boolean;
}

/**
 * Builds the Fastify instance without listening, so tests can drive it with
 * `app.inject(...)` and no open sockets.
 *
 * PHASE 1 (current): process liveness only.
 * PHASE 3 adds: the SQLite connection as a Fastify decorator.
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

  app.register(cors, { origin: [...config.allowedOrigins] });

  app.get("/api/health", async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      version: OBSERVATORY_VERSION,
      contractVersion: CONTRACT_VERSION,
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  });

  return app;
}
