/**
 * @observatory/telemetry
 *
 * The ingestion half of the pipeline in BUILD.md section 10:
 *
 *   raw event -> validation -> normalization -> redaction -> persistence
 *
 * PHASE 1 (current): package identity + build wiring only.
 * PHASE 2 fills in: validate.ts (Zod parsing of untrusted input),
 *                   normalize.ts (command/path normalization used later by
 *                   repetition detection, section 15), and the in-memory
 *                   event processor.
 * PHASE 2 also fills in: redact.ts - secret redaction (section 48). This is a
 *                   hard requirement: it must run BEFORE anything is written to
 *                   SQLite, never after.
 */

export const PACKAGE_NAME = "@observatory/telemetry" as const;
