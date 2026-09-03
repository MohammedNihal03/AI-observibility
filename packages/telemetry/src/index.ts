/**
 * @observatory/telemetry
 *
 * The ingestion half of the pipeline in BUILD.md section 10:
 *
 *   raw event -> validation -> normalization -> redaction -> persistence
 *
 * PHASE 2 (current): validation, normalization, redaction and the in-memory
 *                    processor. Redaction runs before the persistence sink, by
 *                    construction rather than by convention (section 48).
 * PHASE 3 adds: a SQLite-backed sink behind the same `onEvent` hook.
 */

export const PACKAGE_NAME = "@observatory/telemetry" as const;

export { EventValidationError } from "./errors.js";
export type { EventValidationIssue } from "./errors.js";

export {
  parseAgentEvent,
  parseEventInput,
  parseNormalizedEvent,
  tryParseEventInput,
} from "./validate.js";

export {
  DEFAULT_INSIGNIFICANT_FLAGS,
  eventSignature,
  normalizeCommand,
  normalizeEvent,
  normalizePath,
  normalizeWhitespace,
} from "./normalize.js";
export type { NormalizeContext, NormalizeOptions } from "./normalize.js";

export { redactDeep, redactEvent, redactString, redactionKinds } from "./redact.js";
export type { RedactionHit, RedactionResult } from "./redact.js";

export { createEventProcessor, fixedClock, sequentialIds } from "./processor.js";
export type {
  EventProcessor,
  EventProcessorOptions,
  EventProcessorStats,
  ProcessedEvent,
} from "./processor.js";
