import { generateDemoSession, type DemoScenario } from "@observatory/collectors";
import type { AgentEventInput } from "@observatory/shared";

import { createApiClient, type ApiClient } from "./api.js";

/**
 * `observatory demo --stream` (BUILD.md Phase 9).
 *
 * Replays a generated session into the running server one event at a time, so
 * the dashboard fills in as it watches rather than appearing all at once. The
 * server does the rest of section 31's chain - process, metrics, health,
 * broadcast - on every arrival.
 *
 * ## Timestamps
 *
 * The generator's own timestamps are dropped and the server stamps each event
 * as it arrives. A streamed session really is happening now, and claiming a
 * duration the replay did not take would be the same class of small lie this
 * product exists to avoid. The GAPS between events are preserved (divided by
 * `speed`), so the session keeps its rhythm: a test run still takes longer than
 * a file read.
 */

export interface StreamOptions {
  readonly scenario: DemoScenario;
  readonly seed?: string;
  readonly server?: string;
  /** How much faster than the simulated session to replay. */
  readonly speed?: number;
  readonly client?: ApiClient;
  /** Called after each event lands, for progress output. */
  readonly onProgress?: (sent: number, total: number, label: string) => void;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface StreamResult {
  readonly sessionId: string;
  readonly sent: number;
  readonly redactions: number;
  readonly elapsedMs: number;
  readonly server: string;
}

/** Longest pause between two events. A demo that stalls is a demo nobody watches. */
const MAX_GAP_MS = 1_400;
const DEFAULT_SPEED = 6;

const wait = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

/** A short human label for an event, for the CLI's progress line. */
function labelOf(event: AgentEventInput): string {
  if (event.tool?.command !== undefined) return event.tool.command;
  if (event.files?.path !== undefined) return `${event.type} ${event.files.path}`;
  if (event.result?.status !== undefined) return `${event.type} (${event.result.status})`;
  return event.type;
}

export async function streamDemo(options: StreamOptions): Promise<StreamResult> {
  const client = options.client ?? createApiClient(options.server);
  const sleep = options.sleep ?? wait;
  const speed = Math.max(0.1, options.speed ?? DEFAULT_SPEED);

  const demo = generateDemoSession({
    scenario: options.scenario,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    startedAt: new Date().toISOString(),
  });

  await client.createSession({
    id: demo.sessionId,
    source: demo.source,
    model: demo.model,
    goal: demo.goal,
    goalKeywords: [...demo.goalKeywords],
    startedAt: new Date().toISOString(),
  });

  const startedAt = Date.now();
  let sent = 0;
  let redactions = 0;
  let previous: number | null = null;

  for (const event of demo.events) {
    const at = Date.parse(event.timestamp ?? "");
    if (previous !== null && Number.isFinite(at)) {
      await sleep(Math.min(MAX_GAP_MS, Math.round((at - previous) / speed)));
    }
    if (Number.isFinite(at)) previous = at;

    // The server assigns the timestamp; see the note above.
    const { timestamp: _dropped, ...payload } = event;
    const result = await client.sendEvent(demo.sessionId, payload);
    sent += result.accepted;
    redactions += (result as { redactions?: number }).redactions ?? 0;

    options.onProgress?.(sent, demo.events.length, labelOf(event));
  }

  await client.endSession(demo.sessionId);

  return {
    sessionId: demo.sessionId,
    sent,
    redactions,
    elapsedMs: Date.now() - startedAt,
    server: client.server,
  };
}
