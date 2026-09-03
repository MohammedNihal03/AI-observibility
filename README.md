# AI Agent Observatory

**TensorBoard for AI coding agents.**

A local-first developer tool that answers one question about an AI coding agent such as Claude Code
or Codex:

> Is my agent behaving well — and if not, why?

It measures **observable agent behavior**: tool calls, failures, repeated actions, recovery,
correction loops, token and context usage. Every score comes with the reasons behind it.

> **What this is not.** The Observatory does not measure neural-network learning. There are no
> weights, gradients, loss values or optimizer state here, because Claude Code and Codex do not
> expose them to an external local application. "Behavioral learning" means _the agent's observable
> behavior improved during this session_ — nothing more. See [docs/scoring.md](docs/scoring.md).

---

## Status

Under active construction, one phase at a time (see `Build.md`, section 58).

| Phase                     | State       |
| ------------------------- | ----------- |
| 0 — Repository inspection | done        |
| 1 — Monorepo foundation   | done        |
| 2 — Event system          | done        |
| 3 — SQLite persistence    | done        |
| 4 — Metrics engine        | done        |
| 5 — Behavioral engine     | done        |
| 6 — Demo generator        | done        |
| 7 — REST API + WebSocket  | done        |
| 8 — Dashboard             | done        |
| 9 — Real-time dashboard   | done        |
| 10 — CLI                  | done        |
| 11 — Claude Code adapter  | done        |
| 12 — Codex adapter        | not started |
| 13 — Polish               | done        |

Everything works except the Codex adapter: the API, the live dashboard, the full CLI, and
`observatory import`, which observes **real Claude Code sessions**. Codex sessions are readable in
principle — `observatory doctor` says so rather than pretending otherwise — but nothing reads them
yet.

---

## Requirements

- **Node.js 20.11 or newer** (developed on 22.21.0)
- **npm 10 or newer** (this repo uses npm workspaces; pnpm and yarn are not configured)

No cloud account. No API key. Nothing is uploaded anywhere.

---

## Setup

```bash
npm install
```

That is the whole install. `better-sqlite3` is a native module; it installs from a prebuilt binary
on common platforms and needs no compiler toolchain.

## Running it

```bash
npm run dev
```

This builds the workspace packages, then starts three watchers together:

| Process          | URL                   | What it is                           |
| ---------------- | --------------------- | ------------------------------------ |
| API server       | http://127.0.0.1:4000 | Fastify REST + (later) WebSocket hub |
| Dashboard        | http://127.0.0.1:4001 | Next.js dashboard                    |
| Package compiler | —                     | `tsc -b --watch` over `packages/*`   |

Open **http://127.0.0.1:4001**.

Both servers bind to the loopback interface only, so nothing on your network can reach your
telemetry. Ports 4000/4001 were chosen deliberately to avoid the crowd on port 3000; override with
`OBSERVATORY_PORT` and `next dev --port`.

Check the API is alive:

```bash
curl http://127.0.0.1:4000/api/health
# {"status":"ok","version":"0.1.0","contractVersion":1,"time":"...","uptimeSeconds":1}
```

### Running one side only

```bash
npm run dev:server
npm run dev:web
```

## The CLI

```bash
node cli/dist/index.js --help     # after `npm run build:packages`
npx tsx cli/src/index.ts --help   # straight from source
```

```
observatory start       Start the local API server
observatory status      What the Observatory is doing right now
observatory sessions    List recorded sessions with their scores
observatory dashboard   Open the dashboard in a browser
observatory demo        Generate and analyze a simulated session
observatory import      Observe a real Claude Code session
observatory doctor      Check the local environment and integrations
```

To type `observatory` rather than the whole path:

```bash
npm run build:packages && npm link --workspace @observatory/cli
```

`npm run observatory -- <command>` works without linking anything.

### A first run

```bash
observatory start          # terminal 1: the API
npm run dev:web            # terminal 2: the dashboard
observatory import         # terminal 3: observe your last Claude Code session
observatory dashboard      # open it
```

`observatory doctor` reports on all of the above at once, including whether Claude Code has written
any transcripts to read:

```
  ✓ Node.js           v22.21.0 on win32 x64
  ✓ API server        http://127.0.0.1:4000 · 2 sessions
  ✓ Claude Code       104 sessions, newest just now
  ⚠ Codex             adapter not implemented (Phase 12)
  ✓ Scoring config    weights valid · 5 health components
  ✓ Secret redaction  12 credential formats recognised
```

## Seeing it work without an agent: `observatory demo`

With `npm run dev` running, stream a simulated session into the dashboard and watch it fill in:

```bash
npx tsx cli/src/index.ts demo --scenario improving --stream
```

The events are replayed one at a time into the API. On each arrival the server re-runs the engine
and pushes a new snapshot down the WebSocket, so the health score, the chart, the signals and the
timeline all move while you watch. The header shows **● LIVE** for exactly as long as the socket is
open and the session is still running — never a moment longer.

Add `--speed <n>` to replay faster or slower (default 6×), and `--server <url>` to point at a
different API.

Without `--stream` the demo runs entirely offline — generate, analyze, print — which needs no server
at all:

```bash
npx tsx cli/src/index.ts demo --scenario stable
npx tsx cli/src/index.ts demo --scenario degrading
```

Either way the session goes through the **real** pipeline — validation, normalization, redaction,
metrics, behavioral analysis — and the offline report prints the verdict with the reasons behind it:

```
  AGENT HEALTH          74 / 100   stable (5/5 components measured)
  BEHAVIORAL LEARNING   73 / 100   ▲ IMPROVING
  DEGRADATION           28 / 100

  WINDOW      actions   errors   recovery   repetition   on-goal
  early          12      60%         0%          33%       75%
  middle         12      33%       100%          17%       83%
  recent         12      17%       100%          17%       83%

  WHY THE AGENT IS IMPROVING
    ✓ 4 successful correction loops
    ✓ Recovery rate increased 100.0 points
    ⚠ 1 retry with no change in between
```

| Scenario    | What the simulated agent does                                             | Verdict     |
| ----------- | ------------------------------------------------------------------------- | ----------- |
| `improving` | thrashes, investigates, then recovers from everything                     | ▲ IMPROVING |
| `stable`    | one failure per stretch, corrected each time, no trend either way         | ● STABLE    |
| `degrading` | the same test fails seven times; edits stop helping; drifts off the goal  | ▼ DEGRADING |

Other flags: `--seed <value>` (any seed produces the same three verdicts, only the file and command
names change), `--started-at <iso>`, `--json` for the full analysis, and `--events` for the raw
events as NDJSON.

**Simulated data is always labelled as simulated.** The session id starts with `demo_`, every event
carries `metadata.simulated = true`, and both the report and the dashboard say so. It is never
presented as observed agent telemetry.

---

## Observing a real agent: `observatory import`

Claude Code appends a JSONL transcript of every session to
`~/.claude/projects/<project>/<sessionId>.jsonl` as it works. The adapter reads it — no hook, no
configuration, no cooperation from the agent required.

```bash
npx tsx cli/src/index.ts import --list          # what is on this machine
npx tsx cli/src/index.ts import                 # the newest session
npx tsx cli/src/index.ts import --session 5f80  # a specific one (prefix is enough)
npx tsx cli/src/index.ts import --watch         # keep following a session as it runs
```

Re-running is safe: the server is asked how many events it already holds and only the remainder is
sent, which is also how `--watch` appends.

### What leaves your machine: nothing

The import sends the **shape** of the work, never its content:

| Sent                                             | Not sent                                        |
| ------------------------------------------------ | ----------------------------------------------- |
| Which tool ran, and its call id                  | Prompt text, assistant replies, thinking blocks |
| The file path that was read or edited            | File contents, diffs, `old_string`/`new_string` |
| The command line (capped at 500 characters)      | Command output, stdout, stderr                  |
| Success or failure, from Claude Code's `is_error`| Error messages                                  |
| Token counts per API response                    | —                                               |

The command cap is not arbitrary. A heredoc is a command line too: measured on a real session, the
median command was 209 characters but the longest was 2,243 characters of embedded Python. Commands
are truncated with their original length appended, so long ones stay distinguishable from each other
without carrying a file inside them.

Everything still goes through redaction before storage, but the cheapest way not to leak a secret is
not to carry it.

### What is real, and what stays unknown

| Measure                          | With Claude Code                                        |
| -------------------------------- | ------------------------------------------------------- |
| Failures, recovery, correction loops | **Real.** `is_error` makes failure deterministic     |
| Files read / modified            | **Real**, counted as distinct paths by semantic type     |
| Tokens                           | **Real**, deduplicated by `message.id`                   |
| Repetition, health, learning      | **Real** — the same engine, on real events               |
| Context utilization              | **Unknown.** Claude Code never states the model's limit  |

Sub-agent work (`isSidechain`) is left out of the parent session by default: a subagent is a
different agent, and blending its tool calls into the parent's would average two behaviours into one
score. `--include-sidechains` opts in.

---

## The API

The dashboard is a client of the local server like any other; it computes nothing itself.

| Endpoint                          | What it does                                              |
| --------------------------------- | --------------------------------------------------------- |
| `POST /api/sessions`              | Create a session                                          |
| `GET /api/sessions`               | List sessions with their headline scores                  |
| `GET /api/sessions/:id`           | The full snapshot the dashboard renders                   |
| `PATCH /api/sessions/:id`         | End a session, or correct its goal/model                  |
| `POST /api/sessions/:id/events`   | Ingest one event or a batch                               |
| `GET /api/sessions/:id/metrics`   | Metrics, the three windows, and the progress series       |
| `GET /api/sessions/:id/health`    | Health, learning and degradation — with their reasons     |
| `GET /api/sessions/:id/timeline`  | The activity rows                                         |
| `GET /api/sessions/:id/events`    | The stored events themselves                              |
| `WS /api/sessions/:id/stream`     | Live updates: `hello`, `event`, `snapshot`, `session_ended` |

Ingestion follows one order, deliberately: **validate → normalize → redact → store → analyze →
broadcast**. Redaction sits upstream of both the database and the socket, so neither can be handed a
credential. The broadcast carries a freshly recomputed snapshot rather than a diff, so the client
never has to hold a second opinion about what the numbers are.

---

## Development commands

| Command                  | What it does                                               |
| ------------------------ | ---------------------------------------------------------- |
| `npm run dev`            | Everything, in watch mode                                  |
| `npm run build`          | Build packages, server, CLI and the dashboard              |
| `npm run build:packages` | `tsc -b` over the TypeScript project graph                 |
| `npm run typecheck`      | Type-check every workspace, dashboard included             |
| `npm test`               | Vitest, run against package **source** (no build required) |
| `npm run test:watch`     | Vitest in watch mode                                       |
| `npm run lint`           | ESLint over the repo                                       |
| `npm run format`         | Prettier, write                                            |
| `npm run clean`          | Remove TypeScript build output                             |
| `npm run db:generate`    | Generate a migration from the schema                       |
| `npm run db:studio`      | Browse the local database in Drizzle Studio                |

---

## Repository layout

```
apps/
  web/          Next.js dashboard
  server/       Fastify API + WebSocket hub
packages/
  shared/       Event, session, metric and health contracts (Zod) + scoring config
  telemetry/    Validation, normalization, secret redaction, event processing
  metrics/      Deterministic metric computation (pure functions)
  behavior/     Repetition, correction loops, recovery, health, learning, degradation
  collectors/   Agent adapters: Claude Code, Codex, generic, demo
cli/            The `observatory` command
database/
  migrations/   SQLite migrations
docs/           Architecture, scoring and integration notes
```

The analytics packages (`metrics`, `behavior`) are pure and synchronous: events in, scores and
reasons out. They never touch the database, the network, or an LLM. That is what makes the results
reproducible and testable — and it means adding a new agent adapter never touches the scoring
engine.

---

## Privacy

- Everything runs on your machine. There is no server component that phones home.
- Secret redaction runs **before** anything is written to disk (`packages/telemetry`).
- The database lives at `data/observatory.db` and is git-ignored, along with every `*.sqlite`/`*.db`
  file. Override the location with `OBSERVATORY_DB`.
- Events are stored as structured columns plus a redacted, size-capped metadata payload (4 KB by
  default). The Observatory never stores raw transcript content or command output — the event
  contract has no field for it.

## Further reading

- [docs/architecture.md](docs/architecture.md) — how a raw event becomes a score
- [docs/scoring.md](docs/scoring.md) — what every score means, and what it does not mean
- [docs/integrations.md](docs/integrations.md) — what Claude Code and Codex actually expose locally
- `Build.md` — the full build specification

## License

MIT
