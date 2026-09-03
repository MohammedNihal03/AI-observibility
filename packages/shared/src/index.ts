/**
 * @observatory/shared
 *
 * Contracts shared by the server, the CLI, the collectors and the dashboard.
 *
 * PHASE 3 (current): session, signal and metrics-snapshot contracts for
 *                    persistence (BUILD.md sections 9, 51).
 * PHASE 4 adds: the computed metrics types (section 11).
 * PHASE 5 adds: the single scoring-configuration object (sections 20, 24, 25,
 *               26) - weights and thresholds live in exactly one place.
 */

export const PACKAGE_NAME = "@observatory/shared" as const;

/** Version of the event/API contract. Bumped when a persisted shape changes. */
export const CONTRACT_VERSION = 1 as const;

export { OBSERVATORY_VERSION } from "./version.js";

export {
  ACTION_EVENT_TYPES,
  AGENT_EVENT_TYPES,
  AGENT_SOURCES,
  FILE_EVENT_TYPES,
  OUTCOME_EVENT_TYPES,
  RESULT_CONFIDENCES,
  RESULT_STATUSES,
  agentEventInputSchema,
  agentEventSchema,
  agentEventTypeSchema,
  agentSourceSchema,
  eventFilesSchema,
  eventResultSchema,
  eventTokensSchema,
  eventToolSchema,
  isActionEvent,
  isFailure,
  isFileEvent,
  isOutcomeEvent,
  isSuccess,
  isoTimestampSchema,
  normalizedAgentEventSchema,
  resultConfidenceSchema,
  resultStatusSchema,
} from "./events.js";

export type {
  AgentEvent,
  AgentEventInput,
  AgentEventType,
  AgentSource,
  NormalizedAgentEvent,
  ResultConfidence,
  ResultStatus,
} from "./events.js";

export {
  AGENT_STATES,
  SESSION_STATUSES,
  agentStateSchema,
  sessionCreateSchema,
  sessionRecordSchema,
  sessionStatusSchema,
  sessionUpdateSchema,
} from "./session.js";

export type {
  AgentState,
  Session,
  SessionCounters,
  SessionCreate,
  SessionRecord,
  SessionStatus,
  SessionUpdate,
} from "./session.js";

export {
  REASON_KINDS,
  SIGNAL_SEVERITIES,
  SIGNAL_TYPES,
  reasonKindSchema,
  reasonSchema,
  signalCreateSchema,
  signalRecordSchema,
  signalSeveritySchema,
  signalTypeSchema,
} from "./signals.js";

export type {
  Reason,
  ReasonKind,
  SignalCreate,
  SignalRecord,
  SignalSeverity,
  SignalType,
} from "./signals.js";

export {
  COST_SOURCES,
  EMPTY_METRICS,
  MAXIMUM_SOURCES,
  metricsSnapshotCreateSchema,
  metricsSnapshotSchema,
} from "./metrics.js";

export {
  DEFAULT_SCORING_CONFIG,
  HEALTH_STATES,
  assertValidScoringConfig,
  healthStateFor,
  validateScoringConfig,
} from "./scoring.js";

export type {
  DegradationWeights,
  HealthState,
  HealthWeights,
  LearningWeights,
  ScoringConfig,
  ScoringConfigProblem,
} from "./scoring.js";

export type {
  HealthComponentView,
  SessionSnapshot,
  SessionSummary,
  SnapshotScores,
  SnapshotSession,
  SnapshotSignal,
  SnapshotWindow,
  StreamMessage,
  TimelineEntry,
  TimelineKind,
  TrendPoint,
} from "./dashboard.js";

export type {
  BehavioralCounts,
  ContextUsage,
  CostEstimate,
  CostSource,
  MaximumSource,
  MetricsSnapshot,
  MetricsSnapshotCreate,
  ModelPricing,
  PricingRegistry,
  SessionMetrics,
  TokenUsage,
} from "./metrics.js";
