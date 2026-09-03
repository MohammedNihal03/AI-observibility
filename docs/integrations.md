# Agent integrations — what is actually available

Build.md section 66: when an integration detail is unknown, investigate rather than guess; when
something cannot be accessed, document the limitation and keep building.

This file records what was **observed on a real machine**, not what an API might plausibly offer.
Everything below was verified by reading local files produced by the tools themselves.

Verified against: **Claude Code 2.1.251**, **codex-cli 0.142.5**, Windows 11, Node 22.21.0.
Re-verify when either CLI updates — these are local file formats, not committed public APIs.

---

## Claude Code

### Where the data is

```
~/.claude/projects/<cwd-slug>/<sessionId>.jsonl
```

One JSON object per line, appended as the session progresses. A JSONL tail is therefore a viable
zero-configuration collector.

### Fields confirmed present

Common to most lines: `timestamp`, `uuid`, `parentUuid`, `sessionId`, `cwd`, `gitBranch`, `version`,
`type`.

Line `type` values seen: `user`, `assistant`, `system`, `attachment`, `cost-state`,
`file-history-snapshot`, `mode`, `permission-mode`, `last-prompt`, `ai-title`.

| What we need     | Where it comes from                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model            | `message.model`                                                                                                                                       |
| Token usage      | `message.usage.input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, plus `output_tokens_details.thinking_tokens` |
| Tool calls       | `tool_use` content blocks — `name` and `input`                                                                                                        |
| Tool results     | `toolUseResult` — `stdout`, `stderr`, `interrupted`                                                                                                   |
| **Tool failure** | `is_error: true` on the `tool_result` content block                                                                                                   |
| Cost             | `cost-state` line — `totalCostUSD`, per-model token totals                                                                                            |
| Timing           | `cost-state.totalToolDuration`, `totalAPIDuration`, `durationMs` on system lines                                                                      |
| Edit volume      | `cost-state.totalLinesAdded` / `totalLinesRemoved`                                                                                                    |

`is_error` matters more than it looks: it makes failure detection **deterministic**. No parsing of
stderr, no guessing from exit codes that were never recorded.

Real cost data also means the Observatory can report Claude Code cost as **reported**, rather than
estimating it from a pricing table.

### Live ingestion paths

1. **Hooks** — `PostToolUse` and friends configured in `~/.claude/settings.json`. Push-based, lowest
   latency, no polling. Confirmed supported by this CLI build.
2. **Stream JSON** — `claude -p --output-format=stream-json --include-hook-events` for wrapped runs.
3. **JSONL tail** — works for any session with no configuration at all. The fallback, and the
   default.

### Limitations

- **No context-window maximum is reported.** The transcript states the model but not its limit. Per
  Build.md section 29 the Observatory will not invent one: context is reported in absolute tokens,
  and a utilization percentage appears only when a maximum comes from a configurable model registry,
  labelled as _configured_, not _reported_.
- The format is an internal implementation detail. It may change between releases. The adapter must
  fail soft — skip lines it does not understand rather than refusing the session.

---

## Codex

### Where the data is

```
~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<sessionId>.jsonl
```

### Fields confirmed present

| What we need        | Where it comes from                                                                 |
| ------------------- | ----------------------------------------------------------------------------------- |
| Session identity    | `session_meta` — `session_id`, `cwd`, `cli_version`, `model_provider`, `source`     |
| Token usage         | `event_msg:token_count` — `total_token_usage` and `last_token_usage`                |
| **Context maximum** | `event_msg:token_count.info.model_context_window` — a real number (258400 observed) |
| Rate limits         | `event_msg:token_count.rate_limits`                                                 |
| Tool calls          | `response_item:custom_tool_call` — `name`, `input`, `call_id`, `status`             |
| Tool results        | `response_item:custom_tool_call_output` — `output` (text)                           |
| Turn boundaries     | `event_msg:task_started`, `task_complete`, `item_completed`                         |
| Assistant output    | `response_item:message`, `response_item:reasoning`                                  |

Codex is the **better** source for context utilization: it reports the real window, so
`used / maximum` is a measured figure rather than a configured one.

### Limitations

- **Tool outcomes are unstructured text.** Output looks like
  `"Script completed\nWall time 3.0 seconds\nOutput:\n…"` — no exit code, no error flag. Success and
  failure must therefore be inferred heuristically. The adapter will mark such events with reduced
  confidence rather than presenting a guess as a measurement.
- **No cost data.** Codex bills against subscription rate limits, so there is no per-session dollar
  figure. `estimatedCost` stays `null` and the dashboard shows "Cost unavailable" unless the user
  supplies pricing (Build.md section 30).
- `~/.codex/*.sqlite` (`state_5.sqlite`, `logs_2.sqlite`, `thread_history_1.sqlite`) exist but are
  undocumented internals. **The Observatory does not read them.** Section 66: do not build on
  undocumented internal APIs.

---

## Privacy consequence

Both formats contain full file contents, commands and raw shell output. Any of it can contain
credentials. This is the reason redaction sits inside the ingestion pipeline **upstream of the
database**, and the reason raw payload retention is off by default: the Observatory stores normalized
signatures and digests, not transcripts, unless explicitly asked to.

## What the generic path covers

Any agent, including ones that do not exist yet, can be observed without an adapter:

```
POST /api/sessions
POST /api/sessions/:id/events
```

The adapter interface is a convenience for agents whose telemetry we can read locally. It is not a
requirement for using the product.
