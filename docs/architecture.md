# Architecture

## The one-way pipeline

Everything in the Observatory is one pipeline. An event enters at the top and leaves as a score with
reasons attached.

```
        Claude Code / Codex / demo generator
                        │
                  ┌─────▼──────┐
                  │ Collector  │   packages/collectors
                  └─────┬──────┘
                        │  raw, agent-specific
                  ┌─────▼──────┐
                  │ Validation │   packages/telemetry  (Zod, untrusted input)
                  ├────────────┤
                  │ Normalize  │   commands, paths, signatures
                  ├────────────┤
                  │ Redaction  │   secrets removed HERE, before any write
                  └─────┬──────┘
                        │  AgentEvent (normalized, safe to persist)
                  ┌─────▼──────┐
                  │ Persistence│   SQLite via Drizzle
                  └─────┬──────┘
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
      Metrics       Behavior       Context      packages/metrics, packages/behavior
          └─────────────┼─────────────┘
                  ┌─────▼──────┐
                  │   Health   │   score + state band
                  ├────────────┤
                  │  Learning  │   behavioral trend across rolling windows
                  ├────────────┤
                  │Degradation │   seven weighted signals
                  ├────────────┤
                  │ Explain    │   reasons, generated from the numbers above
                  └─────┬──────┘
                        │
                  ┌─────▼──────┐
                  │ REST + WS  │   apps/server
                  └─────┬──────┘
                        ▼
                    Dashboard      apps/web
```

## Rules that shape the code

**1. The analytics core is pure.**
`packages/metrics` and `packages/behavior` export functions of `(events, config) -> result`. No
database handle, no clock, no network, no LLM. Anything time-dependent is injected. This is what
makes a fixed-seed demo session produce byte-identical scores on every run (Build.md section 57).

**2. Agents are adapters, and the core never imports them.**
The dependency arrow points one way: `collectors -> shared`, never `behavior -> collectors`. Adding
a third agent means adding one file under `packages/collectors`, and nothing in the scoring engine
changes.

**3. Redaction happens before persistence, not after.**
Secret removal sits inside the ingestion pipeline, upstream of the database. There is no window in
which an unredacted payload exists on disk.

**4. Unknown is a value.**
When a provider does not expose something — a context-window maximum, a token price — the answer is
`null` and the UI says so. Nothing is inferred to fill a gap.

**5. Scoring configuration lives in exactly one place.**
Every weight and threshold is defined in `packages/shared`. No weight is written inline in a scoring
function, so retuning the product never means grepping for magic numbers.

**6. The persistence layer stores; it does not compute.**
`apps/server/src/db` reads and writes rows and counts them. It derives no rate, score or aggregate.
Computing a metric in SQL as well as in `packages/metrics` would create two implementations that
quietly disagree, and the SQL one would be the harder to test.

## Storage notes

Timestamps are ISO 8601 strings rather than epoch integers: they sort lexicographically, they are
readable in `sqlite3`, and they round-trip to the event contract without conversion.

Events carry a `sequence` column alongside `timestamp`. Real transcripts collide on timestamps
constantly — several tool calls inside one assistant turn share a millisecond — so ordering by
`(timestamp, sequence)` is total and deterministic. Correction-loop and repeated-failure detection
depend on a stable order, so this is a correctness requirement, not a nicety.

Every score column is nullable, and null means "not computed". A snapshot taken three events into a
session has no meaningful recovery rate; writing `0` there would render as "0% recovery", which is a
different and false claim.

## The demo generator

`packages/collectors/src/demo.ts` produces synthetic sessions for the three scenarios of Build.md
section 34. It is a collector like any other: it emits `AgentEventInput`s and the CLI feeds them
through validation, normalization, redaction, metrics and behavioral analysis. Nothing about the
demo path bypasses the engine, so a demo verdict is produced by exactly the code that will judge a
real session.

Two design decisions are worth knowing about:

**The seed permutes names, never structure.** Which files are touched, which test command runs and
how many milliseconds elapse are seeded. How many failures occur, whether a file was edited between
a failure and its retry, and how the three phases differ are fixed in the script. If the seed could
move the structure, the classification would be luck — instead every seed yields the same three
verdicts, which is what `cli/src/demo.test.ts` asserts.

**A phase is a window.** The behavioral engine splits a session into three windows by action count,
so each scenario has three phases of exactly twelve actions. One phase lands in one window, and the
story the phases tell is the trend the engine measures.

The scenarios were written as behavior, not tuned against the weights. The improving session scores
74 health and the stable one 82, because an agent that spent its first third thrashing genuinely is
in worse shape than one that never did — health says how it is doing, learning says which way it is
going.

## Dependency graph

```
shared  ◄── telemetry ◄── collectors
   ▲            ▲              ▲
   │            │              │
   ├── metrics ─┤              │
   │      ▲     │              │
   │   behavior │              │
   │      ▲     │              │
   └──────┴─────┴──────────────┴──── apps/server, cli
                                     apps/web ──► shared
```

Enforced by TypeScript project references in each `tsconfig.json`: a cycle or an illegal import
fails `tsc -b`, not code review.

## Build and test topology

- **`tsc -b`** builds the project graph in dependency order. Packages emit `dist/` with declarations;
  the server and CLI consume the built output.
- **Vitest** aliases `@observatory/*` to package **source**, so `npm test` never depends on a prior
  build. Type checking is a separate gate.
- **The dashboard** is type-checked by Next.js and excluded from the `tsc -b` graph, because it needs
  bundler module resolution and JSX settings the Node projects must not inherit.

## Ports

| Port | Process   | Bind      |
| ---- | --------- | --------- |
| 4000 | API       | 127.0.0.1 |
| 4001 | Dashboard | 127.0.0.1 |

Loopback only, by default and on purpose: session telemetry from a developer's machine should not
become reachable from the local network by accident.
