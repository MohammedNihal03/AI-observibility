import { z } from "zod";

import { isoTimestampSchema } from "./events.js";

/**
 * The persisted metrics snapshot (BUILD.md section 51).
 *
 * One row per recalculation, so the dashboard can chart a score over the
 * session (section 36, "Agent health over session steps") rather than only
 * showing the latest value.
 *
 * Every field is nullable. A snapshot taken three events into a session has no
 * meaningful recovery rate, and null is the honest representation of that -
 * writing 0 would render as "0% recovery", which is a different and false
 * claim (sections 22, 27).
 *
 * The computation itself lands in Phase 4 (rates) and Phase 5 (scores). This
 * module only fixes the shape both sides agree on.
 */

const nonEmptyString = z.string().min(1);
const score = z.number().min(0).max(100).nullable();
const rate = z.number().min(0).max(1).nullable();

export const metricsSnapshotSchema = z.object({
  id: nonEmptyString,
  sessionId: nonEmptyString,
  timestamp: isoTimestampSchema,

  /** 0-100. See docs/scoring.md - these are product bands, not measurements. */
  healthScore: score,
  /** 0-100 behavioral learning. NOT neural-network learning (section 2). */
  learningScore: score,
  /** 0-100, where 0 is no degradation detected (section 24). */
  degradationScore: score,

  successRate: rate,
  errorRate: rate,
  recoveryRate: rate,
  repetitionRate: rate,
  correctionLoopRate: rate,
  toolEfficiency: rate,
  /**
   * Tokens used over the context maximum, 0-1.
   *
   * Null when the provider does not report a maximum and none is configured.
   * A maximum is never invented to produce a percentage (section 29).
   */
  contextPressure: rate,
});
export type MetricsSnapshot = z.infer<typeof metricsSnapshotSchema>;

export const metricsSnapshotCreateSchema = metricsSnapshotSchema
  .omit({ id: true, timestamp: true })
  .extend({
    id: nonEmptyString.optional(),
    timestamp: isoTimestampSchema.optional(),
    healthScore: score.optional(),
    learningScore: score.optional(),
    degradationScore: score.optional(),
    successRate: rate.optional(),
    errorRate: rate.optional(),
    recoveryRate: rate.optional(),
    repetitionRate: rate.optional(),
    correctionLoopRate: rate.optional(),
    toolEfficiency: rate.optional(),
    contextPressure: rate.optional(),
  });
export type MetricsSnapshotCreate = z.infer<typeof metricsSnapshotCreateSchema>;

/** An empty snapshot: nothing computed yet, and honest about it. */
export const EMPTY_METRICS: Omit<MetricsSnapshot, "id" | "sessionId" | "timestamp"> = {
  healthScore: null,
  learningScore: null,
  degradationScore: null,
  successRate: null,
  errorRate: null,
  recoveryRate: null,
  repetitionRate: null,
  correctionLoopRate: null,
  toolEfficiency: null,
  contextPressure: null,
};
