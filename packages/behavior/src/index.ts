/**
 * @observatory/behavior
 *
 * Behavioral analysis over normalized events (BUILD.md sections 15-28).
 *
 * IMPORTANT NAMING RULE (section 2): nothing in this package measures
 * neural-network learning. There are no gradients, no weights, no loss. The
 * "learning score" here is BEHAVIORAL learning - whether the agent's observable
 * behavior improves within a session. Never label it as model learning.
 *
 * PHASE 1 (current): package identity + build wiring only.
 * PHASE 5 fills in:
 *   repetition.ts        - normalized-string repeated-action detection (15, 16)
 *   correction-loops.ts  - edit -> test -> fail -> edit -> test -> pass (17)
 *   recovery.ts          - recovery score (18)
 *   trends.ts            - rolling early/middle/recent windows (21)
 *   learning.ts          - behavioral learning score + state (19, 20, 22)
 *   degradation.ts       - the seven degradation signals (23, 24)
 *   health.ts            - agent health score + state bands (25, 26)
 *   explain.ts           - reasons generated from real metrics only (27)
 *   goal-drift.ts        - GoalDriftDetector interface + keyword impl (28)
 */

export const PACKAGE_NAME = "@observatory/behavior" as const;
