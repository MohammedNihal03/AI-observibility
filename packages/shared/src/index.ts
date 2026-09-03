/**
 * @observatory/shared
 *
 * Contracts shared by the server, the CLI, the collectors and the dashboard.
 *
 * PHASE 1 (current): package identity + build wiring only.
 * PHASE 2 fills in: AgentEvent / AgentSource / AgentEventType Zod schemas and
 *                   their inferred types (BUILD.md section 8).
 * PHASE 3 fills in: Session and persistence-facing types (section 9, 51).
 * PHASE 4 fills in: Metrics types (section 11).
 * PHASE 5 fills in: Health / Learning / Degradation / Signal / Reason types and
 *                   the single scoring-configuration object (sections 20, 24,
 *                   25, 26) - weights and thresholds live in exactly one place.
 */

export const PACKAGE_NAME = "@observatory/shared" as const;

/** Version of the event/API contract. Bumped when a persisted shape changes. */
export const CONTRACT_VERSION = 1 as const;

export { OBSERVATORY_VERSION } from "./version.js";
