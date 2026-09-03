import {
  agentEventInputSchema,
  sessionCreateSchema,
  sessionUpdateSchema,
  type NormalizedAgentEvent,
  type SessionSnapshot,
} from "@observatory/shared";
import { EventValidationError, normalizeEvent, redactEvent } from "@observatory/telemetry";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";

import type { Hub } from "./hub.js";
import { analyzeStoredSession, buildSnapshot, buildSummary, toTimelineEntry } from "./snapshot.js";

/**
 * The REST surface of BUILD.md section 32, plus the stream of section 31.
 *
 * The ingestion route is the interesting one. Section 31 spells out the order:
 *
 *   event -> process -> metrics -> health -> broadcast
 *
 * and this file follows it literally: validate, normalize, REDACT, store,
 * re-analyze, push. Redaction sits before the store and before the socket, so
 * neither the database nor a connected dashboard can be handed a credential
 * (section 48).
 */

const eventBatchSchema = z.union([
  agentEventInputSchema,
  z.object({ events: z.array(agentEventInputSchema).min(1).max(1000) }),
  z.array(agentEventInputSchema).min(1).max(1000),
]);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.enum(["active", "completed", "aborted"]).optional(),
});

interface SessionParams {
  readonly id: string;
}

/** Fastify's websocket handler shape, narrowed to what this file uses. */
interface SocketLike {
  send(data: string): void;
  readyState?: number;
  on(event: "close" | "error", listener: () => void): void;
  close(): void;
}

export interface RouteOptions {
  readonly hub: Hub;
  readonly now?: () => Date;
  readonly idFactory?: (sequence: number) => string;
}

export function registerRoutes(app: FastifyInstance, options: RouteOptions): void {
  const { hub } = options;
  const now = options.now ?? ((): Date => new Date());
  let ingestSequence = 0;

  const nextId = (): string =>
    options.idFactory === undefined ? nanoid() : options.idFactory(++ingestSequence);

  const snapshotFor = (sessionId: string): SessionSnapshot | undefined => {
    const analyzed = analyzeStoredSession(app.store, sessionId);
    return analyzed === undefined ? undefined : buildSnapshot(analyzed, { now });
  };

  /* ---------------------------------------------------------------- sessions */

  app.post("/api/sessions", async (request, reply) => {
    const parsed = sessionCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_session", issues: parsed.error.issues });
    }
    const record = app.store.sessions.create(parsed.data);
    return reply.code(201).send(record);
  });

  app.get("/api/sessions", async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ error: "invalid_query", issues: query.error.issues });
    }

    const records = app.store.sessions.list({
      limit: query.data.limit ?? 50,
      offset: query.data.offset ?? 0,
      ...(query.data.status !== undefined ? { status: query.data.status } : {}),
    });

    const sessions = records
      .map((record) => analyzeStoredSession(app.store, record.id))
      .filter((analyzed) => analyzed !== undefined)
      .map(buildSummary);

    return reply.send({ sessions, count: sessions.length });
  });

  app.get<{ Params: SessionParams }>("/api/sessions/:id", async (request, reply) => {
    const snapshot = snapshotFor(request.params.id);
    if (snapshot === undefined) return reply.code(404).send({ error: "unknown_session" });
    return reply.send(snapshot);
  });

  app.patch<{ Params: SessionParams }>("/api/sessions/:id", async (request, reply) => {
    const parsed = sessionUpdateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_update", issues: parsed.error.issues });
    }
    const record = app.store.sessions.update(request.params.id, parsed.data);
    if (record === undefined) return reply.code(404).send({ error: "unknown_session" });

    if (record.endedAt !== null) {
      hub.broadcast(record.id, { type: "session_ended", sessionId: record.id });
    }
    const snapshot = snapshotFor(record.id);
    if (snapshot !== undefined) {
      hub.broadcast(record.id, { type: "snapshot", sessionId: record.id, snapshot });
    }
    return reply.send(record);
  });

  /* ------------------------------------------------------------------ events */

  app.post<{ Params: SessionParams }>("/api/sessions/:id/events", async (request, reply) => {
    const sessionId = request.params.id;
    const session = app.store.sessions.get(sessionId);
    if (session === undefined) return reply.code(404).send({ error: "unknown_session" });

    const parsed = eventBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_event", issues: parsed.error.issues });
    }

    const inputs = Array.isArray(parsed.data)
      ? parsed.data
      : "events" in parsed.data
        ? parsed.data.events
        : [parsed.data];

    const accepted: NormalizedAgentEvent[] = [];
    let redactions = 0;

    try {
      for (const input of inputs) {
        const normalized = normalizeEvent(input, {
          sessionId,
          id: nextId(),
          timestamp: now().toISOString(),
        });
        const { value, redactions: hits } = redactEvent(normalized);
        redactions += hits.reduce((total, hit) => total + hit.count, 0);
        accepted.push(value);
      }
    } catch (error: unknown) {
      if (error instanceof EventValidationError) {
        return reply.code(400).send({ error: "invalid_event", message: error.message });
      }
      throw error;
    }

    const stored = app.store.events.appendMany(sessionId, accepted);

    // Section 31's order: the analysis runs after persistence, so what the
    // dashboard is told matches what a later reload will read back.
    const snapshot = snapshotFor(sessionId);

    if (snapshot !== undefined) {
      let lastCommand = "a command";
      for (const event of stored) {
        if (event.type === "tool_call" || event.type === "command_started") {
          lastCommand = event.tool?.command ?? event.tool?.name ?? lastCommand;
        }
        const entry = toTimelineEntry(event, lastCommand);
        if (entry !== null) hub.broadcast(sessionId, { type: "event", sessionId, entry });
      }
      hub.broadcast(sessionId, { type: "snapshot", sessionId, snapshot });
    }

    return reply.code(202).send({
      accepted: stored.length,
      redactions,
      eventIds: stored.map((event) => event.id),
    });
  });

  /* ----------------------------------------------------------------- reports */

  app.get<{ Params: SessionParams }>("/api/sessions/:id/metrics", async (request, reply) => {
    const snapshot = snapshotFor(request.params.id);
    if (snapshot === undefined) return reply.code(404).send({ error: "unknown_session" });
    return reply.send({
      sessionId: request.params.id,
      metrics: snapshot.metrics,
      windows: snapshot.windows,
      trend: snapshot.trend,
    });
  });

  app.get<{ Params: SessionParams }>("/api/sessions/:id/health", async (request, reply) => {
    const snapshot = snapshotFor(request.params.id);
    if (snapshot === undefined) return reply.code(404).send({ error: "unknown_session" });
    // Scores never travel without their reasons (section 27).
    return reply.send({
      sessionId: request.params.id,
      ...snapshot.scores,
      reasons: snapshot.reasons,
      signals: snapshot.signals,
    });
  });

  app.get<{ Params: SessionParams }>("/api/sessions/:id/timeline", async (request, reply) => {
    const snapshot = snapshotFor(request.params.id);
    if (snapshot === undefined) return reply.code(404).send({ error: "unknown_session" });
    return reply.send({ sessionId: request.params.id, timeline: snapshot.timeline });
  });

  app.get<{ Params: SessionParams }>("/api/sessions/:id/events", async (request, reply) => {
    const session = app.store.sessions.get(request.params.id);
    if (session === undefined) return reply.code(404).send({ error: "unknown_session" });
    const query = listQuerySchema.safeParse(request.query ?? {});
    const events = app.store.events.list(request.params.id, {
      limit: query.success ? (query.data.limit ?? 500) : 500,
      offset: query.success ? (query.data.offset ?? 0) : 0,
    });
    return reply.send({ sessionId: request.params.id, events, count: events.length });
  });

  /* ------------------------------------------------------------------ stream */

  app.get<{ Params: SessionParams }>(
    "/api/sessions/:id/stream",
    { websocket: true },
    (socket: SocketLike, request) => {
      const sessionId = request.params.id;
      const snapshot = snapshotFor(sessionId);

      if (snapshot === undefined) {
        hub.send(socket, { type: "error", message: `unknown session: ${sessionId}` });
        socket.close();
        return;
      }

      // The first message is the current state, so a dashboard that connects
      // mid-session renders immediately instead of waiting for the next event.
      hub.send(socket, { type: "hello", sessionId, snapshot });

      const unsubscribe = hub.subscribe(sessionId, socket);
      socket.on("close", unsubscribe);
      socket.on("error", unsubscribe);
    },
  );
}
