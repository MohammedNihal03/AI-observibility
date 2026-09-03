/**
 * @observatory/metrics
 *
 * Deterministic metric computation (BUILD.md sections 11-14).
 *
 * Design rule for this package: every export is a PURE function of
 * `AgentEvent[]` plus configuration. No database access, no network access, no
 * LLM calls (section 50). That is what makes the analytics reproducible under a
 * fixed seed (section 57) and testable without a running server.
 *
 * PHASE 1 (current): package identity + build wiring only.
 * PHASE 4 fills in: counters.ts (totals, tokens, files, commands),
 *                   rates.ts (success rate, error rate),
 *                   tools.ts (tool efficiency, section 13),
 *                   context.ts (token accounting; NEVER invents a context
 *                   maximum - section 29).
 */

export const PACKAGE_NAME = "@observatory/metrics" as const;
