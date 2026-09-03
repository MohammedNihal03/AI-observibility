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
| 5 — Behavioral engine     | next        |
| 6–13 — demo → adapters    | not started |

The CLI registers all of its commands today, but every command reports honestly that it is not
implemented yet and names the phase that will implement it.

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
```

Once Phase 10 lands, `observatory` is available as a command. Planned surface:

```
observatory start        Start the collector and API server
observatory status       Show the status of the running observatory
observatory sessions     List recorded sessions
observatory dashboard    Open the dashboard
observatory demo         Generate a simulated session
observatory doctor       Diagnose the local environment and agent integrations
```

`observatory demo --scenario improving|stable|degrading` will generate a deterministic simulated
session. Simulated data is always labelled as simulated — it is never presented as observed agent
telemetry.

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
