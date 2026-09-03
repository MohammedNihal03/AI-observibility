import type { StreamMessage } from "@observatory/shared";

/**
 * The WebSocket hub (BUILD.md section 31).
 *
 * Subscriptions are per session, so a dashboard watching one agent is not woken
 * by another. The hub knows nothing about metrics or health - it moves already
 * built messages - which keeps the socket layer out of the analytics path.
 */

/** The subset of a WebSocket this hub needs. Keeps it testable without sockets. */
export interface Subscriber {
  send(data: string): void;
  readonly readyState?: number;
}

/** `WebSocket.OPEN`. Sending to a closing socket throws on some runtimes. */
const OPEN = 1;

export interface Hub {
  /** Registers a subscriber. Returns the unsubscribe function. */
  subscribe(sessionId: string, subscriber: Subscriber): () => void;
  /** Sends to every subscriber of one session. Returns how many received it. */
  broadcast(sessionId: string, message: StreamMessage): number;
  send(subscriber: Subscriber, message: StreamMessage): void;
  subscriberCount(sessionId?: string): number;
  clear(): void;
}

export function createHub(): Hub {
  const bySession = new Map<string, Set<Subscriber>>();

  const send = (subscriber: Subscriber, message: StreamMessage): void => {
    if (subscriber.readyState !== undefined && subscriber.readyState !== OPEN) return;
    try {
      subscriber.send(JSON.stringify(message));
    } catch {
      // A socket that died between the readyState check and the write must not
      // take the ingestion request down with it. The close handler will
      // unsubscribe it moments later.
    }
  };

  return {
    subscribe(sessionId, subscriber) {
      const existing = bySession.get(sessionId);
      if (existing === undefined) {
        bySession.set(sessionId, new Set([subscriber]));
      } else {
        existing.add(subscriber);
      }

      return (): void => {
        const set = bySession.get(sessionId);
        if (set === undefined) return;
        set.delete(subscriber);
        if (set.size === 0) bySession.delete(sessionId);
      };
    },

    broadcast(sessionId, message) {
      const subscribers = bySession.get(sessionId);
      if (subscribers === undefined) return 0;
      let delivered = 0;
      for (const subscriber of subscribers) {
        send(subscriber, message);
        delivered += 1;
      }
      return delivered;
    },

    send,

    subscriberCount(sessionId) {
      if (sessionId !== undefined) return bySession.get(sessionId)?.size ?? 0;
      let total = 0;
      for (const set of bySession.values()) total += set.size;
      return total;
    },

    clear() {
      bySession.clear();
    },
  };
}
