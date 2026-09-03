# AI Agent Observatory — Full Build Specification

## Project Name

**AI Agent Observatory**

Working tagline:

> TensorBoard for AI Coding Agents.

---

# 1. Vision

Build a local developer tool that monitors AI coding agents such as:

- Claude Code
- OpenAI Codex
- Other compatible coding agents in the future

The tool should help a developer understand:

> Is my AI coding agent performing well?

> Is it adapting to mistakes?

> Is it getting more efficient during the session?

> Is it repeating itself?

> Is it losing track of the task?

> Is it showing signs of behavioral degradation?

> What exactly is causing the degradation?

The product should visualize agent behavior in a simple, highly user-friendly way.

---

# 2. Critical Concept

This product must distinguish between:

## Actual model learning

Actual neural-network learning involves:

- weights
- gradients
- backpropagation
- loss
- optimizer state
- learning rate
- parameter updates

Claude Code and Codex generally do NOT expose these internal values to an external local application.

Therefore:

**DO NOT pretend that behavioral metrics are actual gradients or model-weight learning.**

Instead, for externally observed coding agents use:

- Agent Health
- Behavioral Learning
- Adaptation
- Recovery
- Performance Signals
- Degradation
- Behavioral Efficiency

These represent observable agent behavior.

---

# 3. Product Metaphor

The product should feel similar to:

> TensorBoard, but for AI coding-agent behavior.

TensorBoard answers:

> "How is my ML model training?"

AI Agent Observatory answers:

> "How is my coding agent behaving?"

---

# 4. Technology Stack

Use TypeScript throughout the MVP.

## Frontend

- Next.js
- TypeScript
- Tailwind CSS
- Recharts
- WebSocket client

## Backend

- Node.js
- TypeScript
- Fastify or Express
- WebSocket support

Prefer Fastify unless the existing project already uses Express.

## Database

SQLite

Use:

- Drizzle ORM or Prisma

Prefer Drizzle for a lightweight local-first application.

## CLI

TypeScript + Node.js

Use Commander or yargs.

Prefer Commander unless there is an existing CLI framework.

## Validation

Zod

## Testing

Vitest

## Package manager

Use npm unless the repository already uses pnpm or yarn.

---

# 5. Architecture

Use a monorepo structure.

Recommended:

    ai-agent-observatory/

    apps/
        web/
        server/

    packages/
        shared/
        telemetry/
        metrics/
        behavior/
        collectors/

    database/
        migrations/

    cli/

    docs/

    scripts/

    package.json

    README.md

    BUILD.md

---

# 6. High-Level Architecture

The system should look like:

                         ┌─────────────────┐
                         │   Claude Code   │
                         └────────┬────────┘
                                  │
                         ┌────────▼────────┐
                         │                 │
                         │     Collector   │
                         │                 │
                         └────────┬────────┘
                                  │
                         normalized events
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Event Processor │
                         └────────┬────────┘
                                  │
                   ┌──────────────┼──────────────┐
                   │              │              │
                   ▼              ▼              ▼
               Metrics        Behavior       Context
                Engine         Engine         Engine
                   │              │              │
                   └──────────────┼──────────────┘
                                  ▼
                         ┌─────────────────┐
                         │  Health Engine  │
                         └────────┬────────┘
                                  │
                         ┌────────▼────────┐
                         │ Learning /      │
                         │ Degradation     │
                         │ Engine          │
                         └────────┬────────┘
                                  │
                                  ▼
                             SQLite
                                  │
                                  ▼
                         WebSocket / API
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Next.js         │
                         │ Dashboard       │
                         └─────────────────┘

---

# 7. Design Principles

Follow these principles throughout development.

## Local-first

The application should work locally.

Do not require a cloud account.

Do not upload source code externally.

## Modular

Claude Code and Codex should be adapters.

The analytics engine must NOT depend directly on either one.

## Explainable

Every score must have an explanation.

Never show:

    Health = 62

without explaining why.

## Observable

Prefer measurable behavior over subjective assumptions.

## Honest

Never claim to know model internals that are unavailable.

## Lightweight

Telemetry collection must not noticeably slow down the coding agent.

---

# 8. Normalized Event System

Everything should revolve around a common event schema.

Create:

    packages/shared/

with common TypeScript types.

Example:

```ts
type AgentSource =
  | "claude_code"
  | "codex"
  | "generic";

type AgentEventType =
  | "session_started"
  | "session_ended"
  | "user_message"
  | "assistant_message"
  | "tool_call"
  | "tool_result"
  | "file_read"
  | "file_write"
  | "file_edit"
  | "command_started"
  | "command_finished"
  | "test_started"
  | "test_finished"
  | "error"
  | "warning"
  | "search"
  | "git_operation"
  | "context_update"
  | "model_response";

interface AgentEvent {
  id: string;
  sessionId: string;
  timestamp: string;
  source: AgentSource;
  type: AgentEventType;

  tool?: {
    name: string;
    command?: string;
  };

  result?: {
    status?: "success" | "error" | "unknown";
    exitCode?: number;
    durationMs?: number;
  };

  tokens?: {
    input?: number;
    output?: number;
    cached?: number;
  };

  files?: {
    path?: string;
  };

  metadata?: Record<string, unknown>;
}
```

Keep the schema extensible.

---

# 9. Session Model

Each session should contain:

    id
    source
    model
    startedAt
    endedAt
    status

    totalEvents

    totalToolCalls
    successfulToolCalls
    failedToolCalls

    inputTokens
    outputTokens
    cachedTokens

    estimatedCost

    filesRead
    filesModified

    commandsExecuted
    errors
    warnings

    healthScore
    learningScore
    degradationScore

    currentState

Possible current states:

    improving
    stable
    degrading
    insufficient_data

---

# 10. Event Processing Pipeline

Every incoming event should follow:

    raw event
       ↓
    validation
       ↓
    normalization
       ↓
    persistence
       ↓
    metrics update
       ↓
    behavior analysis
       ↓
    health calculation
       ↓
    learning/degradation calculation
       ↓
    WebSocket update

This pipeline must be deterministic where possible.

---

# 11. Metrics Engine

Create:

    packages/metrics/

Calculate:

## Basic metrics

    totalEvents
    totalToolCalls
    successfulToolCalls
    failedToolCalls

    inputTokens
    outputTokens
    cachedTokens

    filesRead
    filesModified

    commandsExecuted
    errors
    warnings

    sessionDuration

## Behavioral metrics

    successRate
    errorRate
    recoveryRate
    repetitionRate
    correctionLoopRate
    toolEfficiency
    goalAdherence
    contextPressure

---

# 12. Success Rate

Calculate:

    successful actions
    ------------------
    total actions

Example:

    80 successful
    100 total

    success rate = 80%

---

# 13. Tool Efficiency

Tool efficiency should consider whether tool calls are productive.

Start simple.

For MVP:

    successfulToolCalls / totalToolCalls

Do not attempt sophisticated productivity scoring initially.

Make the implementation extensible.

---

# 14. Error Detection

Track:

- command failures
- test failures
- tool failures
- API errors
- application errors

Each error should contain:

    timestamp
    command/tool
    normalized signature
    status
    recovery information

---

# 15. Repetition Detection

Detect repeated actions.

Example:

    npm test
    ERROR

    npm test
    ERROR

    npm test
    ERROR

This should generate:

    repeated_action_detected

Start with normalized string comparison.

Normalize:

- whitespace
- insignificant flags where safe
- environment-specific paths when possible

Do NOT use embeddings or LLM calls for repetition detection in the MVP.

Later versions may use semantic similarity.

---

# 16. Failed Repetition Is Worse Than Normal Failure

A single failure is not necessarily bad.

Example:

    npm test
    ↓
    failure
    ↓
    inspect error
    ↓
    modify code
    ↓
    npm test
    ↓
    success

This is healthy recovery.

But:

    npm test
    ↓
    failure
    ↓
    npm test
    ↓
    failure
    ↓
    npm test
    ↓
    failure

is a strong degradation signal.

The scoring engine must distinguish these.

---

# 17. Correction Loop Detection

Detect sequences such as:

    edit
    test
    failure
    edit
    test
    success

This is a healthy correction loop.

Track:

    correctionLoops
    successfulCorrectionLoops
    failedCorrectionLoops

Example:

    5 correction loops
    4 successful

    correction recovery = 80%

---

# 18. Recovery Score

Calculate:

    successful recoveries
    ---------------------
    total failures

Example:

    7 failures
    6 successful recoveries

    recovery score = 85.7

A failed attempt should not heavily damage the agent score if the agent successfully adapts afterward.

---

# 19. Behavioral Learning

Create:

    packages/behavior/learning.ts

The learning score represents:

> Whether the agent appears to improve its behavior during the current session.

It does NOT represent actual model-weight learning.

Use trends such as:

    error rate
    recovery rate
    tool efficiency
    repetition rate
    correction-loop rate
    goal adherence

---

# 20. Learning Score

Create a configurable score from 0–100.

Initial suggested weights:

    recovery improvement       25%
    error reduction            20%
    repetition reduction       20%
    tool efficiency improvement 15%
    goal adherence improvement 20%

Make weights configurable.

Do not hard-code them throughout the application.

Put scoring configuration in one place.

---

# 21. Rolling Window

Do NOT compare only:

    first event
    last event

Use rolling windows.

Example:

    early window
    middle window
    recent window

Calculate trends from these windows.

This avoids misleading results caused by one unusual event.

---

# 22. Learning State

Classify the agent:

    IMPROVING
    STABLE
    DEGRADING
    INSUFFICIENT DATA

Use configurable thresholds.

Example:

    positive trend > threshold
        IMPROVING

    neutral trend
        STABLE

    negative trend < threshold
        DEGRADING

Not enough observations:

    INSUFFICIENT DATA

Do not classify a session after only one or two events.

---

# 23. Degradation Engine

Create:

    packages/behavior/degradation.ts

Detect:

## Signal 1

Increasing error rate.

## Signal 2

Repeated failed actions.

## Signal 3

Increasing correction loops.

## Signal 4

Declining recovery rate.

## Signal 5

Increasing tool-call waste.

## Signal 6

Possible goal drift.

## Signal 7

High context pressure.

IMPORTANT:

High context usage is a signal, not proof that the agent is degrading.

Do not claim causation.

---

# 24. Degradation Score

Create a score:

    0 = no degradation detected
    100 = severe degradation

Use configurable weights.

Example:

    repeated failed actions     30%
    increasing errors           20%
    recovery decline            20%
    correction loops            15%
    goal drift                  10%
    context pressure             5%

Expose the individual signals.

---

# 25. Agent Health Score

Create:

    healthScore = 0–100

Suggested conceptual weighting:

    recovery                30%
    tool efficiency          20%
    repetition avoidance     20%
    goal adherence            15%
    context management        15%

Keep all weights configurable.

---

# 26. Health States

Use:

    80–100
    HEALTHY

    60–79
    STABLE

    40–59
    WARNING

    0–39
    DEGRADING

These are product thresholds, not scientific measurements.

Clearly document this.

---

# 27. Explainability Engine

Every score must return reasons.

Example API response:

```json
{
  "healthScore": 82,
  "state": "improving",
  "reasons": [
    {
      "type": "positive",
      "message": "Error rate decreased 42%"
    },
    {
      "type": "positive",
      "message": "Recovery rate increased 18%"
    },
    {
      "type": "warning",
      "message": "Context utilization is high"
    }
  ]
}
```

Reasons should be generated from actual metrics.

Never fabricate explanations.

---

# 28. Goal Drift

Goal drift is important but difficult.

For MVP create an interface:

    GoalDriftDetector

Do not build a complicated AI system initially.

Allow a session to optionally have:

    goal
    keywords

Example:

    Goal:
    "Fix authentication timeout."

Keywords:

    authentication
    timeout
    session
    login

Track whether subsequent activity is related.

Future versions can use embeddings or LLM evaluation.

---

# 29. Context Monitoring

Track:

    input tokens
    output tokens
    cached tokens

If the provider exposes context limits, calculate:

    used / maximum

Display:

    Context utilization

Example:

    72%

If the context limit is unknown:

    Context usage available
    Maximum unknown

Do not invent a maximum.

---

# 30. Token and Cost Tracking

Support:

    inputTokens
    outputTokens
    cachedTokens

Cost estimation must be provider/model configurable.

Never hard-code one model's pricing into the analytics engine.

If pricing is unavailable:

    estimatedCost = null

Display:

    Cost unavailable

rather than inventing it.

---

# 31. Real-Time Architecture

Use WebSockets.

When an event is received:

    event
      ↓
    process
      ↓
    calculate metrics
      ↓
    calculate health
      ↓
    broadcast update

The dashboard should update without refresh.

---

# 32. REST API

Implement:

    POST /api/sessions

Create a session.

    GET /api/sessions

List sessions.

    GET /api/sessions/:id

Get session.

    POST /api/sessions/:id/events

Add event.

    GET /api/sessions/:id/metrics

Get metrics.

    GET /api/sessions/:id/health

Get health.

    GET /api/sessions/:id/timeline

Get timeline.

    WS /api/sessions/:id/stream

Real-time updates.

---

# 33. CLI

Create:

    observatory

Commands:

    observatory start

    observatory status

    observatory sessions

    observatory dashboard

    observatory demo

    observatory doctor

Example:

    observatory demo --scenario improving

Supported scenarios:

    improving
    stable
    degrading

---

# 34. Demo Generator

This is REQUIRED.

Create realistic simulated sessions.

The dashboard must be impressive even without Claude Code or Codex.

## Improving scenario

Generate:

    initial failures
    investigation
    successful recovery
    decreasing repetition
    increasing success
    fewer corrections

Expected state:

    🟢 IMPROVING

## Stable scenario

Generate:

    consistent performance
    occasional errors
    successful recovery
    no significant trend

Expected:

    🟡 STABLE

## Degrading scenario

Generate:

    repeated commands
    repeated failures
    increasing corrections
    lower recovery
    increasing context pressure

Expected:

    🔴 DEGRADING

---

# 35. Dashboard UX

The dashboard should look like a polished developer product.

Avoid a generic admin dashboard.

The main page should immediately communicate:

    What is the agent doing?

    How healthy is it?

    Is it improving?

    Why?

---

# 36. Dashboard Layout

Create:

## Header

    AI Agent Observatory

    ● LIVE

    Claude Code / Codex

    Session ID

---

## Hero Card

Display:

    AGENT HEALTH

          82 / 100

          ▲ +14

          IMPROVING

---

## Learning Trend

Line chart:

    Agent health over session steps

Include:

    current score
    trend
    previous score

---

## Metrics Cards

Display:

    Tokens

    Tool Calls

    Errors

    Recovery

    Context

    Files Modified

    Duration

    Cost

---

# 37. Behavioral Panel

Show:

    🔁 Repeated actions

    🔧 Correction loops

    ❌ Errors

    ♻️ Recoveries

    🎯 Goal adherence

    🧠 Behavioral learning

---

# 38. Why Is the Agent Improving?

Create a dedicated section.

Example:

    🟢 WHY THE AGENT IS IMPROVING

    ✓ Error rate decreased 42%
    ✓ Recovery rate increased 18%
    ✓ Fewer repeated commands
    ✓ Tool efficiency improved

---

# 39. Why Is the Agent Degrading?

Example:

    🔴 DEGRADATION DETECTED

    ⚠ 4 repeated failed commands
    ⚠ Error rate increased 31%
    ⚠ Correction loops increased
    ⚠ Recovery rate declined

---

# 40. Timeline

Create a chronological event timeline.

Example:

    13:02:01
    User request

    13:02:04
    Read package.json

    13:02:08
    Read auth.ts

    13:02:15
    Edited auth.ts

    13:02:20
    npm test

    13:02:24
    ❌ Test failed

    13:02:31
    Edited auth.ts

    13:02:37
    npm test

    13:02:41
    ✅ Test passed

Use visual indicators.

---

# 41. Event Details

Clicking an event should reveal:

    timestamp
    event type
    tool
    command
    status
    duration
    related events

Avoid showing secrets.

---

# 42. Session Comparison

Implement a future-ready API, but MVP should support basic comparison.

Allow:

    Session A
    Session B

Compare:

    health
    learning
    errors
    tool efficiency
    recovery
    tokens
    duration

This will eventually help developers compare:

    Claude vs Codex

or:

    different prompts

or:

    different models.

---

# 43. Claude Code Integration

Create:

    packages/collectors/claude-code.ts

IMPORTANT:

Do not assume undocumented APIs.

First inspect the available local environment and official/documented interfaces that can provide session information.

If direct integration is unavailable:

Support ingestion through the generic event API.

Example:

    POST /api/sessions/:id/events

Do NOT fabricate Claude Code telemetry.

The adapter should translate available Claude Code information into:

    AgentEvent

---

# 44. Codex Integration

Create:

    packages/collectors/codex.ts

Again:

Do not assume undocumented internal APIs.

Use available supported telemetry/session information.

Normalize everything into:

    AgentEvent

If direct integration is unavailable, use generic ingestion.

---

# 45. Generic Collector Interface

Create:

```ts
interface AgentCollector {
  source: AgentSource;

  start(): Promise<void>;

  stop(): Promise<void>;

  onEvent(
    callback: (event: AgentEvent) => void
  ): void;
}
```

Claude Code and Codex implement this interface.

---

# 46. Future Local Model Support

Create a future-ready interface:

```ts
interface ModelTrainingTelemetryProvider {
  getLoss(): number | null;

  getGradientNorm(): number | null;

  getLearningRate(): number | null;

  getParameterUpdateNorm(): number | null;

  getGpuMemory(): number | null;
}
```

Do NOT implement fake values.

This interface exists for future local/self-hosted models.

---

# 47. Actual Gradient Dashboard — Future

When real training telemetry becomes available, support:

    Loss

    Gradient Norm

    Learning Rate

    Parameter Update Norm

    GPU Memory

    Activation Statistics

Example:

    Loss
    2.41 ───╮
           ╰────╮
                ╰──── 0.82

    Gradient Norm
    1.82 ──╮
           ╰────╮
                ╰── 0.34

Clearly label these as:

    Model Training Telemetry

not:

    Agent Behavioral Telemetry

---

# 48. Privacy and Security

The application must be local-first.

Never intentionally send:

    source code
    API keys
    passwords
    tokens
    environment secrets

to an external server.

Implement secret redaction.

Redact common patterns such as:

    API keys
    Bearer tokens
    passwords
    private keys
    environment secrets

The redaction system must run before persistence.

---

# 49. Performance

Telemetry processing should be lightweight.

Do not:

    block the coding agent
    store massive conversation payloads unnecessarily
    run expensive LLM calls for every event

The MVP should perform analysis using deterministic local logic.

---

# 50. No LLM Dependency for Core Metrics

The core system must work without another LLM.

Do NOT call an LLM to determine:

    error count
    repetition
    tool count
    recovery
    correction loops
    token usage

These must be deterministic.

LLM-based analysis may be added later for:

    goal drift
    semantic strategy similarity
    task completion quality

---

# 51. Database Schema

Create tables for:

## sessions

    id
    source
    model
    goal
    started_at
    ended_at
    status
    created_at

## events

    id
    session_id
    timestamp
    source
    type
    payload
    created_at

## metrics

    id
    session_id
    timestamp

    health_score
    learning_score
    degradation_score

    success_rate
    error_rate
    recovery_rate
    repetition_rate
    correction_loop_rate
    tool_efficiency
    context_pressure

## signals

    id
    session_id
    timestamp
    type
    severity
    message
    metadata

Use indexes on:

    session_id
    timestamp

---

# 52. API Type Safety

Share schemas between backend and frontend.

Prefer:

    packages/shared

for:

    event types
    API response types
    metric types
    health types

Use Zod schemas where appropriate.

---

# 53. Frontend State

The dashboard should maintain:

    current session
    live metrics
    historical metrics
    events
    signals
    health state

WebSocket updates should update the UI immediately.

---

# 54. Visual Language

Use clear states:

    🟢 Healthy / Improving

    🟡 Stable / Warning

    🔴 Degrading

Do not overuse colors.

The UI should remain readable in dark mode.

Use subtle animations for live changes.

Do not make the dashboard look like a gaming UI.

It should feel like:

    professional developer tooling

---

# 55. Accessibility

Support:

    keyboard navigation
    readable contrast
    accessible labels
    responsive layout

Charts should have text summaries where appropriate.

---

# 56. Testing

Write tests for:

## Event system

    validation
    normalization
    persistence

## Metrics

    success rate
    error rate
    recovery rate
    tool efficiency
    repetition rate

## Behavior

    repeated action detection
    correction loops
    recovery detection

## Health

    health calculation
    state classification

## Learning

    trend detection
    improving classification
    stable classification
    degrading classification

## Security

    secret redaction

---

# 57. Deterministic Tests

The demo generator and analytics engine should be deterministic when given a fixed seed.

This allows:

    improving

    stable

    degrading

to be tested reliably.

---

# 58. Development Phases

Do NOT implement everything at once.

Follow this order.

## PHASE 0 — Repository Inspection

Before making changes:

1. Inspect the repository.
2. Identify existing applications.
3. Identify package manager.
4. Identify existing Next.js setup.
5. Identify existing TypeScript configuration.
6. Check whether a backend already exists.
7. Check existing dependencies.
8. Produce a short implementation plan.

Do not modify code during Phase 0.

---

# PHASE 1 — Monorepo Foundation

Create:

    apps/web
    apps/server
    packages/shared
    packages/metrics
    packages/behavior
    packages/telemetry
    packages/collectors
    cli

Set up TypeScript.

Set up linting.

Set up formatting.

Set up testing.

Verify builds.

---

# PHASE 2 — Event System

Implement:

    AgentEvent

validation

normalization

in-memory processing

tests

---

# PHASE 3 — SQLite

Implement:

    sessions
    events
    metrics
    signals

Add migrations.

Test persistence.

---

# PHASE 4 — Metrics Engine

Implement:

    success
    errors
    tools
    recovery
    repetition
    correction loops
    tokens
    context

Write tests.

---

# PHASE 5 — Behavioral Engine

Implement:

    repetition detection
    correction loops
    recovery
    learning score
    degradation score
    health score
    trend analysis

Write extensive deterministic tests.

---

# PHASE 6 — Demo Generator

Implement:

    improving
    stable
    degrading

Make sure analytics produce the expected states.

---

# PHASE 7 — API

Implement REST endpoints.

Add WebSocket.

Test using generated events.

---

# PHASE 8 — Dashboard

Build:

    health card
    learning chart
    metrics cards
    behavior signals
    timeline

---

# PHASE 9 — Real-Time Dashboard

Connect WebSocket.

Run:

    observatory demo

and watch the dashboard update live.

---

# PHASE 10 — CLI

Implement:

    start
    status
    sessions
    dashboard
    demo
    doctor

---

# PHASE 11 — Claude Code Adapter

Investigate supported telemetry.

Implement only what can actually be observed.

---

# PHASE 12 — Codex Adapter

Investigate supported telemetry.

Implement only what can actually be observed.

---

# PHASE 13 — Polish

Improve:

    UX
    error handling
    loading states
    empty states
    animations
    responsive behavior
    documentation

---

# 59. Demo Requirements

Running:

    observatory demo --scenario improving

must:

1. Create a session.
2. Generate events.
3. Process events.
4. Update metrics.
5. Update health.
6. Update learning state.
7. Broadcast WebSocket events.
8. Display the result in the dashboard.

Same for:

    stable

and:

    degrading

---

# 60. Dashboard Empty State

If there are no sessions:

Show:

    🧠 AI Agent Observatory

    No sessions yet.

    Start an agent session or run:

    observatory demo

Make this polished.

---

# 61. Dashboard Live State

During a live session:

    ● LIVE

Show:

    elapsed time

    events received

    current health

    current learning state

    latest signal

---

# 62. Example Final Dashboard

The dashboard should conceptually resemble:

    ┌──────────────────────────────────────────────┐
    │ AI Agent Observatory             ● LIVE      │
    │ Claude Code · Session #A82F                  │
    ├──────────────────────────────────────────────┤
    │                                              │
    │       AGENT HEALTH                           │
    │                                              │
    │             82 / 100                         │
    │              ▲ +14                           │
    │             IMPROVING                        │
    │                                              │
    ├──────────────────────────────────────────────┤
    │                                              │
    │ Agent Performance                            │
    │                                              │
    │ 90 ┤                         ╭────            │
    │ 80 ┤                   ╭─────╯               │
    │ 70 ┤             ╭─────╯                     │
    │ 60 ┤──────╮──────╯                           │
    │                                              │
    ├──────────────────────────────────────────────┤
    │ Tokens │ Tools │ Errors │ Recovery │ Context │
    │ 48K    │ 74    │ 3      │ 91%      │ 72%     │
    ├──────────────────────────────────────────────┤
    │                                              │
    │ 🟢 WHY AGENT IS IMPROVING                    │
    │                                              │
    │ ✓ Error rate decreased 42%                   │
    │ ✓ Recovery rate increased 18%               │
    │ ✓ Repetition decreased                      │
    │ ⚠ Context utilization is high               │
    │                                              │
    ├──────────────────────────────────────────────┤
    │ ACTIVITY                                     │
    │                                              │
    │ 13:02  Read auth.ts                          │
    │ 13:03  Edit auth.ts                          │
    │ 13:03  npm test                              │
    │ 13:03  ❌ Test failed                        │
    │ 13:04  Edit auth.ts                          │
    │ 13:04  npm test                              │
    │ 13:04  ✓ Test passed                         │
    └──────────────────────────────────────────────┘

---

# 63. Product Quality Bar

The result should NOT feel like:

    a school project
    a raw database viewer
    a generic admin dashboard
    a collection of random charts

It should feel like:

    a serious developer observability product.

Prioritize:

    clarity
    explainability
    accuracy
    responsiveness
    simplicity

---

# 64. What NOT To Build in MVP

Do NOT initially build:

    distributed tracing
    cloud deployment
    user accounts
    team management
    billing
    complex AI agents
    vector databases
    embeddings everywhere
    LLM-based scoring
    actual gradient extraction from Claude/Codex
    Kubernetes
    microservices

Keep the first version local and focused.

---

# 65. Future Roadmap

After MVP:

## V2

    semantic goal drift
    semantic repeated-strategy detection
    session comparison
    model comparison
    prompt comparison

## V3

    team dashboards
    cloud synchronization
    historical analytics
    agent benchmarking

## V4

    local model training telemetry

Support:

    real loss
    gradients
    learning rate
    parameter updates
    GPU statistics

---

# 66. Important Implementation Rule

When you encounter an unknown integration detail:

DO NOT guess.

Investigate the available environment and documentation.

If something cannot be accessed:

1. Clearly document the limitation.
2. Keep the adapter interface.
3. Use generic telemetry ingestion.
4. Continue building the rest of the system.

Never create fake telemetry and label it as real.

---

# 67. Final Definition of Done

The MVP is complete when I can run:

    npm install

    npm run dev

and access the dashboard.

Then:

    observatory demo --scenario improving

should produce a live improving session.

And:

    observatory demo --scenario degrading

should produce a live degrading session.

The dashboard must clearly show:

    Agent Health
    Behavioral Learning
    Degradation
    Token usage
    Context usage
    Tool usage
    Errors
    Recovery
    Repetition
    Correction loops
    Timeline
    Explainable reasons

The system must update in real time.

All core analytics must have tests.

The README must contain exact setup and usage instructions.

---

# 68. Coding Agent Instructions

You are the primary implementation engineer.

Read this entire BUILD.md before making architectural decisions.

DO NOT implement the entire project in one pass.

First perform Phase 0.

Return:

1. Repository assessment.
2. Existing architecture.
3. Proposed architecture.
4. Files that will be created.
5. Files that will be modified.
6. Dependencies that will be added.
7. Potential integration limitations.
8. Phase 1 implementation plan.

Do not modify files during Phase 0.

After Phase 0 approval, implement one phase at a time.

After every phase:

1. Run tests.
2. Run TypeScript checks.
3. Run builds.
4. Fix errors.
5. Report what changed.
6. Report what was verified.

Never hide errors.

Never fabricate telemetry.

Never claim behavioral learning is actual neural-network learning.

Keep the implementation modular and production-quality.

---

# 69. First Command

After reading this BUILD.md, do NOT start coding immediately.

First inspect the repository and provide the Phase 0 assessment and implementation plan.

Wait for approval before making changes.