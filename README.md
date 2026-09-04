# AI Agent Observatory

**See how your AI coding agent is actually behaving.**

You just spent two hours with Claude Code. Did it work steadily toward the goal, or did it spend
forty minutes re-editing the same file and re-running the same failing test? You can scroll back
through the transcript to find out. Or you can run one command.

```bash
observatory import
```

The Observatory reads the session your agent already recorded on disk and answers one question:

> **Is my agent behaving well — and if not, why?**

Everything runs on your machine. No account, no API key, nothing uploaded.

---

## What you get

A local dashboard that shows what your agent did, how healthy the session was, and why.

![The Observatory dashboard: an agent health score of 74 out of 100 marked improving, the five
measured components behind it, a chart of health across the session, and a timeline of every tool
call and its outcome](docs/images/dashboard.png)

And the same answer in your terminal, if you would rather not leave it:

```
  AGENT HEALTH          65 / 100   stable (3/5 components measured)
  BEHAVIORAL LEARNING   34 / 100   ▼ DEGRADING
  DEGRADATION           27 / 100

  Tokens 148M   Actions 396   Errors 3   Recovery 33%   Repetition 23%

  WINDOW      actions   errors   recovery   repetition
  early          132       1%       100%          16%
  middle         132       1%         0%          25%
  recent         132       1%         0%          22%

  WHY THE AGENT IS DEGRADING
    ✗ Recovery rate decreased 100%
    ✗ Repetition increased 39%
    ⚠ 1 retry with no change in between

  SIGNALS
    ⚠ apps/web/src/components/performance-chart.tsx ran 10 times
    ⚠ apps/server/src/app.ts ran 8 times
```

That is a real session — the one that built this tool. It caught the author editing the same
component ten times while fighting a rendering bug, and called the session degrading for it. Every
number comes with the reason behind it; you should never see a score without an explanation.

---

## Quickstart

**You need Node.js 20.11 or newer.** Nothing else.

```bash
npm install -g ai-agent-observatory
```

> **Not on npm yet.** Until it is published, install it from a clone instead — same result, one
> extra minute:
>
> ```bash
> git clone <this repo> && cd ai-agent-observatory
> npm install && npm run package
> npm install -g ./dist-package
> ```
>
> The `./` matters: without it npm looks for a package by that name in the registry.

Start it:

```bash
observatory start
```

```
Observatory running on http://127.0.0.1:4000
Database C:\Users\you\.observatory\observatory.db

  Dashboard   http://127.0.0.1:4000
```

Open **http://127.0.0.1:4000**. It will be empty — nothing has been recorded yet.

In a second terminal, bring in a session you have already run:

```bash
observatory import
```

Refresh the dashboard. That is the whole loop.

**No Claude Code sessions yet?** See it work with simulated data instead:

```bash
observatory demo --scenario improving --stream
```

Watch the dashboard while that runs — the numbers, the chart and the timeline fill in live.

---

## What the numbers mean

Three scores, and they answer different questions. A session can be at 82 and going nowhere, or at
55 and climbing fast.

### Agent health — *how is it doing?*

**0–100.** A weighted average of five things, each measured, each shown to you:

| Component            | Weight | What it measures                                        |
| -------------------- | ------ | ------------------------------------------------------- |
| Recovery             | 30%    | When something failed, did the agent fix it?            |
| Tool efficiency      | 20%    | How many tool calls succeeded                           |
| Repetition avoidance | 20%    | How much of the work was doing something already done   |
| Goal adherence       | 15%    | How much of the work related to what you asked for      |
| Context headroom     | 15%    | How much of the context window is still free            |

| Score  | Band      |
| ------ | --------- |
| 80–100 | healthy   |
| 60–79  | stable    |
| 40–59  | warning   |
| 0–39   | degrading |

A component that cannot be measured is **excluded**, not counted as zero — a session with no
failures has no recovery rate, and scoring that as 0 would rank "never failed" below "failed and
recovered". The dashboard shows you how many of the five were actually measured.

### Behavioral learning — *which way is it going?*

The session is split into three windows by action count — early, middle, recent — and compared.
**Improving** means errors fell, recovery rose, repetition dropped. **Degrading** means the reverse.
**Stable** means no meaningful trend either way.

> This is **not** model learning. There are no weights, gradients or loss values here. Claude Code
> does not expose them, and this tool does not pretend to. "Learning" means the agent's *observable
> behavior* got better during this session — nothing more.

### Degradation — *what is going wrong?*

**0–100**, from seven specific signals: the same action failing repeatedly, rising error rate,
falling recovery, correction loops that keep failing, drifting off the goal, and context pressure.
Each one is listed with the measurement behind it.

### What to do about it

| You see                              | It usually means                                                     |
| ------------------------------------ | -------------------------------------------------------------------- |
| **Repetition high, recovery low**    | The agent is stuck. Give it new information, not another retry.       |
| **"failed N times in a row"**        | It is retrying without changing anything. Intervene.                  |
| **"tried N times, never worked"**    | The whole approach is wrong, not the details. Redirect it.            |
| **Context utilization above 90%**    | It is running out of room. Start a fresh session.                     |
| **Goal adherence falling**           | It has wandered. Restate the goal.                                    |
| **Health high, learning stable**     | Nothing is wrong. Steady competent work looks exactly like this.      |

---

## Commands

| Command                | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `observatory start`    | Start everything — API, live updates and dashboard, on one port  |
| `observatory import`   | Read a real Claude Code session and analyze it                   |
| `observatory sessions` | List what has been recorded                                      |
| `observatory status`   | What the Observatory is doing right now                          |
| `observatory compare`  | Compare two sessions, or group them by model or prompt           |
| `observatory demo`     | Generate a simulated session (no agent required)                 |
| `observatory dashboard`| Open the dashboard in a browser                                  |
| `observatory doctor`   | Check that everything is set up correctly                        |

Every command takes `--help`.

### Importing sessions

```bash
observatory import --list           # what is on this machine
observatory import                  # the newest session
observatory import --session 5f80   # a specific one (a prefix is enough)
observatory import --watch          # follow a session as it runs, live
observatory import --project myapp  # only sessions from one project
```

Re-running is safe. The Observatory asks how much it already has and sends only what is new — which
is also how `--watch` keeps up with a running agent.

### Comparing sessions

```bash
observatory compare <session-a> <session-b>   # side by side
observatory compare --by model                # grouped by model
observatory compare --by goal                 # grouped by prompt
```

![Two sessions side by side: every measure with its value on each side and whether the change is
better or worse, plus the behaviour signals that only one of the two sessions
raised](docs/images/compare.png)

The same thing in the terminal:

```
  left    demo_degrading_BA7E   (degrading)
  right   demo_improving_9E21   (improving)

                         LEFT    RIGHT   CHANGE
  Health                   35       74   +39  better
  Recovery rate           33%     100%   +67 pts  better
  Error rate              71%      35%   -35 pts  better

  Only on the left:
    - npm test → read docs — tried 2 times, never worked
    - npm test -- session failed 7 times in a row
```

Grouped comparison uses **medians, not averages** — one disastrous session should not define a
model — and shows the session count on every row, because a comparison built from one session each
is a data point, not a finding. It shows you differences; it does not claim causes. Two sessions
differ in the model *and* the task *and* the day.

### Trying it without an agent

```bash
observatory demo --scenario improving --stream    # watch it arrive live
observatory demo --scenario degrading             # or just print the report
```

Three scenarios, each with a known verdict:

| Scenario    | What the simulated agent does                                       | Verdict     |
| ----------- | -------------------------------------------------------------------- | ----------- |
| `improving` | thrashes, investigates, then recovers from everything                | ▲ IMPROVING |
| `stable`    | one failure per stretch, corrected each time, no trend               | ● STABLE    |
| `degrading` | the same test fails seven times; edits stop helping; drifts off task  | ▼ DEGRADING |

Simulated sessions are **always labelled as simulated** — in the session id, on every event, and in
the dashboard. They are never presented as something your agent did.

---

## Privacy

This is the part worth reading carefully, because the Observatory reads your agent's transcripts.

**Nothing leaves your machine.** There is no cloud, no telemetry, no phone-home. The server binds to
`127.0.0.1` only, so nothing on your network can reach it either.

**And most of the transcript is never even read into the tool.** The import takes the *shape* of the
work, not its content:

| Recorded                                    | Never recorded                                   |
| ------------------------------------------- | ------------------------------------------------ |
| Which tool ran                              | Your prompts and the agent's replies             |
| The file path that was read or edited       | File contents and diffs                          |
| The command line (capped at 500 characters) | Command output, stdout, stderr                   |
| Whether it succeeded or failed              | Error messages                                   |
| Token counts                                | —                                                |

Anything that does get stored passes through secret redaction first — API keys, tokens, passwords
and private keys in twelve known formats — and redaction runs *before* the database write, so an
unredacted value never touches disk.

Your data lives in one place:

```
~/.observatory/observatory.db
```

Delete that file and everything is gone. Point `OBSERVATORY_DB` somewhere else to move it.

---

## What it can and cannot see

Being straight about the limits, because a number presented confidently is worse than no number.

**Fully measured with Claude Code:**

- Failures and recoveries — Claude Code marks failed tool calls explicitly, so this is a fact, not a guess
- Files read and modified, counted as distinct paths
- Token usage, deduplicated per API response
- Repetition, correction loops, and every score built on them
- Lines added and removed, counted from the patch — the count, never the code
- Thinking tokens, cache hit rate, and commands killed at their time limit

**Not available:**

- **Context utilization.** Claude Code records the model but never its context limit, so the
  Observatory shows "no window reported" rather than inventing a percentage. Codex *does* report it.
- **Cost.** Shown when the agent recorded it, never estimated from a pricing table that would go
  stale.
- **Codex sessions.** Codex writes readable logs and support is planned, but nothing reads them yet.
  `observatory doctor` says so plainly.

**Deliberately approximate:**

Goal adherence is word matching — it connects a goal that says "authentication" to a file called
`auth.ts`, but it will not connect "login" to `session-store.ts`. That is why the signal is called
*possible* goal drift and carries little weight. Same for repeated-strategy detection: it compares
generalized actions, not meanings.

The scores themselves are **product judgements, not science**. The weights above are one reasonable
opinion about what good agent behavior looks like. [docs/scoring.md](docs/scoring.md) explains every
one and how to change it.

---

## Troubleshooting

**`observatory` is not recognised**
npm's global install directory is not on your `PATH`. Find it with `npm prefix -g` and add it (the
executables are in that folder on Windows, and in its `bin` subfolder on macOS and Linux). Or skip
the `PATH` entirely and use `npx ai-agent-observatory <command>`.

**The dashboard says "The Observatory API is not answering"**
`observatory start` is not running, or it is on a different port. Run `observatory doctor`.

**`observatory import` says no transcripts found**
Claude Code writes them the first time you run a session. Confirm with `observatory import --list`.
If that is empty, no sessions exist on this machine yet.

**Port 4000 is already in use**

```bash
observatory start --port 4100
```

**The dashboard is empty after importing**
Check that the import reported events, and that `observatory sessions` lists the session. If it does,
refresh the page.

**Start over**

```bash
rm ~/.observatory/observatory.db      # deletes every recorded session
```

**Uninstall**

```bash
npm uninstall -g ai-agent-observatory
rm -rf ~/.observatory
```

---

## For contributors

```bash
git clone <this repo> && cd ai-agent-observatory
npm install
npm run dev        # API on :4000, dashboard on :4001, packages in watch mode
npm test           # 595 tests, no build required
```

In development the dashboard runs on its own port under `next dev`, which is why it is `:4001` there
and `:4000` once installed. To build the installable package:

```bash
npm run package                # -> dist-package/
npm install -g ./dist-package  # install that build
```

| Command                  | What it does                                       |
| ------------------------ | -------------------------------------------------- |
| `npm run dev`            | Everything, in watch mode                          |
| `npm test`               | Vitest against package source                      |
| `npm run typecheck`      | Type-check every workspace, dashboard included      |
| `npm run lint`           | ESLint over the repo                               |
| `npm run package`        | Build the single publishable package               |
| `npm run db:studio`      | Browse the local database                          |

```
apps/web/          Next.js dashboard (exported to static files when packaged)
apps/server/       Fastify API + WebSocket hub
packages/shared/   Contracts (Zod) and the scoring configuration
packages/telemetry/  Validation, normalization, secret redaction
packages/metrics/  Metric computation — pure functions
packages/behavior/ Repetition, recovery, health, learning, degradation
packages/collectors/ Agent adapters and the demo generator
cli/               The `observatory` command
```

The analytics packages are pure and synchronous: events in, scores and reasons out. No database, no
network, no LLM. That is what makes results reproducible, and it means adding an agent adapter never
touches the scoring engine.

### The API

The dashboard is an ordinary client of the local server and computes nothing itself.

| Endpoint                         | What it does                                  |
| -------------------------------- | --------------------------------------------- |
| `POST /api/sessions`             | Create a session                              |
| `GET /api/sessions`              | List sessions with their headline scores      |
| `GET /api/sessions/:id`          | The full snapshot the dashboard renders       |
| `POST /api/sessions/:id/events`  | Ingest one event or a batch                   |
| `GET /api/sessions/:id/metrics`  | Metrics, windows and the progress series      |
| `GET /api/sessions/:id/health`   | Scores — with the reasons behind them         |
| `GET /api/sessions/:id/timeline` | The activity rows                             |
| `GET /api/compare`               | Compare two sessions, or group them           |
| `WS /api/sessions/:id/stream`    | Live updates while a session runs             |

Any tool can be observed without an adapter by posting events to that API.

### Further reading

- [docs/architecture.md](docs/architecture.md) — how a raw event becomes a score
- [docs/scoring.md](docs/scoring.md) — what every score means and does not mean
- [docs/integrations.md](docs/integrations.md) — what Claude Code and Codex actually expose

---

## License

MIT
