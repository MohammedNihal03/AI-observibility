import type { NormalizedAgentEvent } from "@observatory/shared";
import { nanoid } from "nanoid";

import { normalizeEvent, type NormalizeOptions } from "./normalize.js";
import { redactEvent, type RedactionHit } from "./redact.js";
import { parseEventInput, tryParseEventInput } from "./validate.js";

/**
 * The in-memory event processor (BUILD.md section 10).
 *
 *   validate -> normalize -> redact -> sink -> store
 *
 * The order is the point. Redaction sits upstream of the sink, so whatever the
 * sink does with the event - write it to SQLite in Phase 3, broadcast it over a
 * WebSocket in Phase 7 - it can only ever see redacted data.
 *
 * Determinism: the clock and the id generator are injected. Supply fixed ones
 * and the same input produces byte-identical output, which is what lets the
 * demo scenarios be tested exactly (section 57).
 */

export interface ProcessedEvent {
  readonly event: NormalizedAgentEvent;
  readonly redactions: readonly RedactionHit[];
}

export interface EventProcessorOptions {
  /** Clock. Defaults to `Date.now`. Injected so scoring stays reproducible. */
  readonly now?: () => Date;
  /** Id generator, receives a 1-based sequence number. Defaults to nanoid. */
  readonly idFactory?: (sequence: number) => string;
  readonly normalize?: NormalizeOptions;
  /**
   * Called with every accepted event, already redacted, before it is stored.
   * Phase 3 attaches persistence here; Phase 7 attaches the WebSocket hub.
   */
  readonly onEvent?: (processed: ProcessedEvent) => void;
}

export interface EventProcessorStats {
  readonly sessions: number;
  readonly events: number;
  readonly rejected: number;
  readonly redactions: number;
}

export interface EventProcessor {
  /** Validates, normalizes, redacts and stores one payload. Throws on invalid input. */
  ingest(sessionId: string, raw: unknown): ProcessedEvent;
  /** Non-throwing variant for collectors reading files that may contain junk. */
  tryIngest(sessionId: string, raw: unknown): ProcessedEvent | undefined;
  ingestMany(sessionId: string, raws: readonly unknown[]): readonly ProcessedEvent[];
  /** Events for one session, in arrival order. */
  getEvents(sessionId: string): readonly NormalizedAgentEvent[];
  getSessionIds(): readonly string[];
  stats(): EventProcessorStats;
  clear(): void;
}

export function createEventProcessor(options: EventProcessorOptions = {}): EventProcessor {
  const now = options.now ?? ((): Date => new Date());
  const idFactory = options.idFactory ?? ((): string => nanoid());

  const bySession = new Map<string, NormalizedAgentEvent[]>();
  let sequence = 0;
  let rejected = 0;
  let redactionTotal = 0;

  const store = (event: NormalizedAgentEvent): void => {
    const existing = bySession.get(event.sessionId);
    if (existing === undefined) {
      bySession.set(event.sessionId, [event]);
    } else {
      existing.push(event);
    }
  };

  const process = (
    sessionId: string,
    input: ReturnType<typeof parseEventInput>,
  ): ProcessedEvent => {
    sequence += 1;

    const normalized = normalizeEvent(input, {
      sessionId,
      id: idFactory(sequence),
      timestamp: now().toISOString(),
      ...(options.normalize !== undefined ? { options: options.normalize } : {}),
    });

    const { value: event, redactions } = redactEvent(normalized);
    const processed: ProcessedEvent = { event, redactions };

    redactionTotal += redactions.reduce((total, hit) => total + hit.count, 0);

    options.onEvent?.(processed);
    store(event);

    return processed;
  };

  return {
    ingest(sessionId, raw) {
      return process(sessionId, parseEventInput(raw));
    },

    tryIngest(sessionId, raw) {
      const parsed = tryParseEventInput(raw);
      if (!parsed.ok) {
        rejected += 1;
        return undefined;
      }
      return process(sessionId, parsed.event);
    },

    ingestMany(sessionId, raws) {
      return raws.map((raw) => process(sessionId, parseEventInput(raw)));
    },

    getEvents(sessionId) {
      return bySession.get(sessionId) ?? [];
    },

    getSessionIds() {
      return [...bySession.keys()];
    },

    stats() {
      let events = 0;
      for (const list of bySession.values()) events += list.length;
      return { sessions: bySession.size, events, rejected, redactions: redactionTotal };
    },

    clear() {
      bySession.clear();
      sequence = 0;
      rejected = 0;
      redactionTotal = 0;
    },
  };
}

/**
 * A deterministic id factory for tests and demo generation.
 *
 * `sequentialIds("evt")` yields `evt_000001`, `evt_000002`, ...
 */
export function sequentialIds(prefix = "evt"): (sequence: number) => string {
  return (sequence: number): string => `${prefix}_${String(sequence).padStart(6, "0")}`;
}

/** A fixed clock for tests and demo generation. */
export function fixedClock(start: Date | string, stepMs = 0): () => Date {
  const base = typeof start === "string" ? new Date(start) : start;
  let calls = 0;
  return (): Date => {
    const date = new Date(base.getTime() + calls * stepMs);
    calls += 1;
    return date;
  };
}
