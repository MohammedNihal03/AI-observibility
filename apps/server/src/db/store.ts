import {
  metricsSnapshotCreateSchema,
  sessionCreateSchema,
  sessionUpdateSchema,
  signalCreateSchema,
  type AgentEventType,
  type AgentSource,
  type MetricsSnapshot,
  type MetricsSnapshotCreate,
  type NormalizedAgentEvent,
  type ResultConfidence,
  type ResultStatus,
  type SessionCreate,
  type SessionRecord,
  type SessionStatus,
  type SessionUpdate,
  type SignalCreate,
  type SignalRecord,
  type SignalSeverity,
  type SignalType,
} from "@observatory/shared";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { ObservatoryDatabase } from "./client.js";
import { events, metrics, sessions, signals } from "./schema.js";

/**
 * The persistence layer (BUILD.md sections 51, 10).
 *
 * This module stores and retrieves. It does not compute: no rates, no scores,
 * no aggregates beyond counting rows. Deriving a metric here as well as in
 * `packages/metrics` would create two sources of truth that quietly disagree,
 * so all analysis stays in the pure engine and this layer stays dumb.
 */

/** Metadata larger than this is replaced with a truncation marker. */
const DEFAULT_MAX_PAYLOAD_BYTES = 4096;

export interface StoreOptions {
  readonly now?: () => Date;
  readonly idFactory?: () => string;
  readonly maxPayloadBytes?: number;
}

export interface ListEventsOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly types?: readonly AgentEventType[];
}

export interface ListSessionsOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly status?: SessionStatus;
}

type EventRow = typeof events.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;
type MetricsRow = typeof metrics.$inferSelect;
type SignalRow = typeof signals.$inferSelect;

function encodeJson(value: unknown, maxBytes: number): string | null {
  if (value === undefined || value === null) return null;
  const json = JSON.stringify(value);
  if (json === undefined) return null;
  if (Buffer.byteLength(json, "utf8") <= maxBytes) return json;
  return JSON.stringify({ _truncated: true, _bytes: Buffer.byteLength(json, "utf8") });
}

function decodeJson(value: string | null): Record<string, unknown> | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function decodeKeywords(value: string | null): string[] | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : null;
  } catch {
    return null;
  }
}

function toSessionRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    source: row.source as AgentSource,
    model: row.model,
    goal: row.goal,
    goalKeywords: decodeKeywords(row.goalKeywords),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    status: row.status as SessionStatus,
    createdAt: row.createdAt,
  };
}

/**
 * Rebuilds the event contract from columns.
 *
 * Optional groups are only present when they carry data, so a round-tripped
 * event deep-equals the one that went in - an absent `result` must not come
 * back as `{}`.
 */
function toEvent(row: EventRow): NormalizedAgentEvent {
  const event: NormalizedAgentEvent = {
    id: row.id,
    sessionId: row.sessionId,
    timestamp: row.timestamp,
    source: row.source as AgentSource,
    type: row.type as AgentEventType,
    signature: row.signature,
  };

  if (row.toolName !== null) {
    event.tool = {
      name: row.toolName,
      ...(row.toolCommand !== null ? { command: row.toolCommand } : {}),
    };
  }

  if (
    row.resultStatus !== null ||
    row.exitCode !== null ||
    row.durationMs !== null ||
    row.resultConfidence !== null
  ) {
    event.result = {
      ...(row.resultStatus !== null ? { status: row.resultStatus as ResultStatus } : {}),
      ...(row.exitCode !== null ? { exitCode: row.exitCode } : {}),
      ...(row.durationMs !== null ? { durationMs: row.durationMs } : {}),
      ...(row.resultConfidence !== null
        ? { confidence: row.resultConfidence as ResultConfidence }
        : {}),
    };
  }

  if (row.tokensInput !== null || row.tokensOutput !== null || row.tokensCached !== null) {
    event.tokens = {
      ...(row.tokensInput !== null ? { input: row.tokensInput } : {}),
      ...(row.tokensOutput !== null ? { output: row.tokensOutput } : {}),
      ...(row.tokensCached !== null ? { cached: row.tokensCached } : {}),
    };
  }

  if (row.filePath !== null) {
    event.files = { path: row.filePath };
  }

  const metadata = decodeJson(row.payload);
  if (metadata !== null) {
    event.metadata = metadata;
  }

  return event;
}

function toMetricsSnapshot(row: MetricsRow): MetricsSnapshot {
  return {
    id: row.id,
    sessionId: row.sessionId,
    timestamp: row.timestamp,
    healthScore: row.healthScore,
    learningScore: row.learningScore,
    degradationScore: row.degradationScore,
    successRate: row.successRate,
    errorRate: row.errorRate,
    recoveryRate: row.recoveryRate,
    repetitionRate: row.repetitionRate,
    correctionLoopRate: row.correctionLoopRate,
    toolEfficiency: row.toolEfficiency,
    contextPressure: row.contextPressure,
  };
}

function toSignalRecord(row: SignalRow): SignalRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    timestamp: row.timestamp,
    type: row.type as SignalType,
    severity: row.severity as SignalSeverity,
    message: row.message,
    metadata: decodeJson(row.metadata),
  };
}

export interface SessionStore {
  create(input: SessionCreate): SessionRecord;
  get(id: string): SessionRecord | undefined;
  list(options?: ListSessionsOptions): readonly SessionRecord[];
  update(id: string, patch: SessionUpdate): SessionRecord | undefined;
  /** Marks a session finished. Idempotent. */
  end(
    id: string,
    status?: Extract<SessionStatus, "completed" | "aborted">,
  ): SessionRecord | undefined;
  remove(id: string): boolean;
  count(): number;
}

export interface EventStore {
  append(sessionId: string, event: NormalizedAgentEvent): NormalizedAgentEvent;
  appendMany(
    sessionId: string,
    batch: readonly NormalizedAgentEvent[],
  ): readonly NormalizedAgentEvent[];
  list(sessionId: string, options?: ListEventsOptions): readonly NormalizedAgentEvent[];
  get(id: string): NormalizedAgentEvent | undefined;
  count(sessionId: string): number;
}

export interface MetricsStore {
  insert(input: MetricsSnapshotCreate): MetricsSnapshot;
  latest(sessionId: string): MetricsSnapshot | undefined;
  history(sessionId: string, limit?: number): readonly MetricsSnapshot[];
}

export interface SignalStore {
  insert(input: SignalCreate): SignalRecord;
  list(sessionId: string, limit?: number): readonly SignalRecord[];
  latest(sessionId: string): SignalRecord | undefined;
}

export interface Store {
  readonly sessions: SessionStore;
  readonly events: EventStore;
  readonly metrics: MetricsStore;
  readonly signals: SignalStore;
}

export class UnknownSessionError extends Error {
  constructor(readonly sessionId: string) {
    super(`Unknown session: ${sessionId}`);
    this.name = "UnknownSessionError";
  }
}

export function createStore(db: ObservatoryDatabase, options: StoreOptions = {}): Store {
  const now = options.now ?? ((): Date => new Date());
  const newId = options.idFactory ?? ((): string => nanoid());
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;

  const timestamp = (): string => now().toISOString();

  const requireSession = (sessionId: string): void => {
    const row = db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();
    if (row === undefined) throw new UnknownSessionError(sessionId);
  };

  const nextSequence = (sessionId: string): number => {
    const row = db
      .select({ value: sql<number | null>`max(${events.sequence})` })
      .from(events)
      .where(eq(events.sessionId, sessionId))
      .get();
    return (row?.value ?? 0) + 1;
  };

  const insertEvent = (sessionId: string, event: NormalizedAgentEvent, sequence: number): void => {
    db.insert(events)
      .values({
        id: event.id,
        sessionId,
        timestamp: event.timestamp,
        sequence,
        source: event.source,
        type: event.type,
        signature: event.signature,
        toolName: event.tool?.name ?? null,
        toolCommand: event.tool?.command ?? null,
        resultStatus: event.result?.status ?? null,
        resultConfidence: event.result?.confidence ?? null,
        exitCode: event.result?.exitCode ?? null,
        durationMs: event.result?.durationMs ?? null,
        tokensInput: event.tokens?.input ?? null,
        tokensOutput: event.tokens?.output ?? null,
        tokensCached: event.tokens?.cached ?? null,
        filePath: event.files?.path ?? null,
        payload: encodeJson(event.metadata, maxPayloadBytes),
        createdAt: timestamp(),
      })
      .run();
  };

  const sessionStore: SessionStore = {
    create(input) {
      const parsed: SessionCreate = sessionCreateSchema.parse(input);
      const createdAt = timestamp();
      const row = {
        id: parsed.id ?? newId(),
        source: parsed.source,
        model: parsed.model ?? null,
        goal: parsed.goal ?? null,
        goalKeywords:
          parsed.goalKeywords !== undefined ? JSON.stringify(parsed.goalKeywords) : null,
        startedAt: parsed.startedAt ?? createdAt,
        endedAt: null,
        status: parsed.status ?? "active",
        createdAt,
      };
      db.insert(sessions).values(row).run();
      return toSessionRecord(row);
    },

    get(id) {
      const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
      return row === undefined ? undefined : toSessionRecord(row);
    },

    list(listOptions = {}) {
      const query = db.select().from(sessions).$dynamic();
      const filtered =
        listOptions.status !== undefined
          ? query.where(eq(sessions.status, listOptions.status))
          : query;
      return filtered
        .orderBy(desc(sessions.startedAt), desc(sessions.createdAt))
        .limit(listOptions.limit ?? 100)
        .offset(listOptions.offset ?? 0)
        .all()
        .map(toSessionRecord);
    },

    update(id, patch) {
      const parsed: SessionUpdate = sessionUpdateSchema.parse(patch);
      const changes: Partial<typeof sessions.$inferInsert> = {};
      if (parsed.model !== undefined) changes.model = parsed.model;
      if (parsed.goal !== undefined) changes.goal = parsed.goal;
      if (parsed.goalKeywords !== undefined) {
        changes.goalKeywords =
          parsed.goalKeywords === null ? null : JSON.stringify(parsed.goalKeywords);
      }
      if (parsed.endedAt !== undefined) changes.endedAt = parsed.endedAt;
      if (parsed.status !== undefined) changes.status = parsed.status;

      if (Object.keys(changes).length > 0) {
        db.update(sessions).set(changes).where(eq(sessions.id, id)).run();
      }
      return sessionStore.get(id);
    },

    end(id, status = "completed") {
      const existing = sessionStore.get(id);
      if (existing === undefined) return undefined;
      if (existing.endedAt !== null) return existing;
      return sessionStore.update(id, { status, endedAt: timestamp() });
    },

    remove(id) {
      const result = db.delete(sessions).where(eq(sessions.id, id)).run();
      return result.changes > 0;
    },

    count() {
      const row = db
        .select({ value: sql<number>`count(*)` })
        .from(sessions)
        .get();
      return row?.value ?? 0;
    },
  };

  const eventStore: EventStore = {
    append(sessionId, event) {
      requireSession(sessionId);
      const stored: NormalizedAgentEvent = { ...event, sessionId };
      insertEvent(sessionId, stored, nextSequence(sessionId));
      return stored;
    },

    appendMany(sessionId, batch) {
      if (batch.length === 0) return [];
      requireSession(sessionId);
      return db.transaction((tx): readonly NormalizedAgentEvent[] => {
        const row = tx
          .select({ value: sql<number | null>`max(${events.sequence})` })
          .from(events)
          .where(eq(events.sessionId, sessionId))
          .get();
        let sequence = (row?.value ?? 0) + 1;

        const stored: NormalizedAgentEvent[] = [];
        for (const event of batch) {
          const withSession: NormalizedAgentEvent = { ...event, sessionId };
          tx.insert(events)
            .values({
              id: withSession.id,
              sessionId,
              timestamp: withSession.timestamp,
              sequence,
              source: withSession.source,
              type: withSession.type,
              signature: withSession.signature,
              toolName: withSession.tool?.name ?? null,
              toolCommand: withSession.tool?.command ?? null,
              resultStatus: withSession.result?.status ?? null,
              resultConfidence: withSession.result?.confidence ?? null,
              exitCode: withSession.result?.exitCode ?? null,
              durationMs: withSession.result?.durationMs ?? null,
              tokensInput: withSession.tokens?.input ?? null,
              tokensOutput: withSession.tokens?.output ?? null,
              tokensCached: withSession.tokens?.cached ?? null,
              filePath: withSession.files?.path ?? null,
              payload: encodeJson(withSession.metadata, maxPayloadBytes),
              createdAt: timestamp(),
            })
            .run();
          stored.push(withSession);
          sequence += 1;
        }
        return stored;
      });
    },

    list(sessionId, listOptions = {}) {
      const conditions =
        listOptions.types !== undefined && listOptions.types.length > 0
          ? and(eq(events.sessionId, sessionId), inArray(events.type, [...listOptions.types]))
          : eq(events.sessionId, sessionId);

      return db
        .select()
        .from(events)
        .where(conditions)
        .orderBy(asc(events.timestamp), asc(events.sequence))
        .limit(listOptions.limit ?? 1000)
        .offset(listOptions.offset ?? 0)
        .all()
        .map(toEvent);
    },

    get(id) {
      const row = db.select().from(events).where(eq(events.id, id)).get();
      return row === undefined ? undefined : toEvent(row);
    },

    count(sessionId) {
      const row = db
        .select({ value: sql<number>`count(*)` })
        .from(events)
        .where(eq(events.sessionId, sessionId))
        .get();
      return row?.value ?? 0;
    },
  };

  const metricsStore: MetricsStore = {
    insert(input) {
      const parsed = metricsSnapshotCreateSchema.parse(input);
      requireSession(parsed.sessionId);
      const row = {
        id: parsed.id ?? newId(),
        sessionId: parsed.sessionId,
        timestamp: parsed.timestamp ?? timestamp(),
        healthScore: parsed.healthScore ?? null,
        learningScore: parsed.learningScore ?? null,
        degradationScore: parsed.degradationScore ?? null,
        successRate: parsed.successRate ?? null,
        errorRate: parsed.errorRate ?? null,
        recoveryRate: parsed.recoveryRate ?? null,
        repetitionRate: parsed.repetitionRate ?? null,
        correctionLoopRate: parsed.correctionLoopRate ?? null,
        toolEfficiency: parsed.toolEfficiency ?? null,
        contextPressure: parsed.contextPressure ?? null,
        createdAt: timestamp(),
      };
      db.insert(metrics).values(row).run();
      return toMetricsSnapshot(row);
    },

    latest(sessionId) {
      const row = db
        .select()
        .from(metrics)
        .where(eq(metrics.sessionId, sessionId))
        .orderBy(desc(metrics.timestamp), desc(metrics.createdAt))
        .limit(1)
        .get();
      return row === undefined ? undefined : toMetricsSnapshot(row);
    },

    history(sessionId, limit = 500) {
      return db
        .select()
        .from(metrics)
        .where(eq(metrics.sessionId, sessionId))
        .orderBy(asc(metrics.timestamp), asc(metrics.createdAt))
        .limit(limit)
        .all()
        .map(toMetricsSnapshot);
    },
  };

  const signalStore: SignalStore = {
    insert(input) {
      const parsed = signalCreateSchema.parse(input);
      requireSession(parsed.sessionId);
      const row = {
        id: parsed.id ?? newId(),
        sessionId: parsed.sessionId,
        timestamp: parsed.timestamp ?? timestamp(),
        type: parsed.type,
        severity: parsed.severity,
        message: parsed.message,
        metadata: encodeJson(parsed.metadata, maxPayloadBytes),
        createdAt: timestamp(),
      };
      db.insert(signals).values(row).run();
      return toSignalRecord(row);
    },

    list(sessionId, limit = 200) {
      return db
        .select()
        .from(signals)
        .where(eq(signals.sessionId, sessionId))
        .orderBy(asc(signals.timestamp), asc(signals.createdAt))
        .limit(limit)
        .all()
        .map(toSignalRecord);
    },

    latest(sessionId) {
      const row = db
        .select()
        .from(signals)
        .where(eq(signals.sessionId, sessionId))
        .orderBy(desc(signals.timestamp), desc(signals.createdAt))
        .limit(1)
        .get();
      return row === undefined ? undefined : toSignalRecord(row);
    },
  };

  return {
    sessions: sessionStore,
    events: eventStore,
    metrics: metricsStore,
    signals: signalStore,
  };
}
