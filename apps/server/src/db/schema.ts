import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * SQLite schema (BUILD.md section 51).
 *
 * Conventions:
 *
 * - **Timestamps are ISO 8601 strings, not epoch integers.** They sort
 *   lexicographically, they survive inspection with the sqlite3 CLI, and they
 *   round-trip to the event contract without conversion.
 * - **Scores and rates are nullable.** Null means "not computed", which is the
 *   honest state early in a session. Zero would be a claim.
 * - **Events cascade from their session.** Deleting a session must not leave
 *   orphaned telemetry behind.
 */

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    model: text("model"),
    goal: text("goal"),
    /** JSON array of keywords for goal-drift detection (section 28). */
    goalKeywords: text("goal_keywords"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("sessions_started_at_idx").on(table.startedAt),
    index("sessions_status_idx").on(table.status),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    timestamp: text("timestamp").notNull(),
    /**
     * Arrival order within the session.
     *
     * Timestamps collide constantly in real transcripts - several tool calls
     * inside one assistant turn share a timestamp to the millisecond. Ordering
     * by (timestamp, sequence) is therefore total and deterministic, which
     * correction-loop and repeated-failure detection depend on (sections 16, 17).
     */
    sequence: integer("sequence").notNull(),
    source: text("source").notNull(),
    type: text("type").notNull(),
    /** Normalized action identity, used by repetition detection (section 15). */
    signature: text("signature").notNull(),

    toolName: text("tool_name"),
    toolCommand: text("tool_command"),

    resultStatus: text("result_status"),
    /** `reported` or `inferred` - whether the status was stated or derived. */
    resultConfidence: text("result_confidence"),
    exitCode: integer("exit_code"),
    durationMs: integer("duration_ms"),

    tokensInput: integer("tokens_input"),
    tokensOutput: integer("tokens_output"),
    tokensCached: integer("tokens_cached"),

    filePath: text("file_path"),

    /** Redacted metadata as JSON, size-capped. Never raw transcript content. */
    payload: text("payload"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("events_session_idx").on(table.sessionId),
    index("events_session_order_idx").on(table.sessionId, table.timestamp, table.sequence),
    index("events_session_sequence_idx").on(table.sessionId, table.sequence),
    index("events_timestamp_idx").on(table.timestamp),
    index("events_session_signature_idx").on(table.sessionId, table.signature),
    index("events_session_type_idx").on(table.sessionId, table.type),
  ],
);

export const metrics = sqliteTable(
  "metrics",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    timestamp: text("timestamp").notNull(),

    healthScore: real("health_score"),
    learningScore: real("learning_score"),
    degradationScore: real("degradation_score"),

    successRate: real("success_rate"),
    errorRate: real("error_rate"),
    recoveryRate: real("recovery_rate"),
    repetitionRate: real("repetition_rate"),
    correctionLoopRate: real("correction_loop_rate"),
    toolEfficiency: real("tool_efficiency"),
    contextPressure: real("context_pressure"),

    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("metrics_session_idx").on(table.sessionId),
    index("metrics_session_timestamp_idx").on(table.sessionId, table.timestamp),
  ],
);

export const signals = sqliteTable(
  "signals",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    timestamp: text("timestamp").notNull(),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    message: text("message").notNull(),
    /** JSON, redacted. */
    metadata: text("metadata"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("signals_session_idx").on(table.sessionId),
    index("signals_session_timestamp_idx").on(table.sessionId, table.timestamp),
    index("signals_severity_idx").on(table.severity),
  ],
);

export const schema = { sessions, events, metrics, signals };
