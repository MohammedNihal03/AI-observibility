/**
 * @observatory/collectors
 *
 * Agent adapters (BUILD.md sections 43-46).
 *
 * Every adapter implements the same `AgentCollector` interface and emits
 * `AgentEvent`s. The analytics packages must never import an adapter, so that
 * adding a new agent never touches the scoring engine.
 *
 * PHASE 1 (current): package identity + build wiring only.
 * PHASE 6  fills in: demo.ts - seeded synthetic sessions (improving / stable /
 *                    degrading). Clearly labelled as simulated, never as
 *                    observed agent telemetry.
 * PHASE 11 fills in: claude-code.ts - reads local Claude Code session
 *                    transcripts and/or hook events. See docs/integrations.md
 *                    for what the local environment actually exposes.
 * PHASE 12 fills in: codex.ts - reads local Codex rollout session logs.
 *
 * Also in this package (interface only, deliberately unimplemented):
 * `ModelTrainingTelemetryProvider` (section 46). It exists so that a future
 * local/self-hosted model can supply REAL loss and gradient values. Until such
 * a provider exists, every method returns null. Fake values are never invented.
 */

export const PACKAGE_NAME = "@observatory/collectors" as const;
