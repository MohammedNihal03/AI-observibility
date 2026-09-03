"use client";

import type { SessionSnapshot, SessionSummary, StreamMessage } from "@observatory/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiUnreachableError, fetchSessions, fetchSnapshot, streamUrl } from "./api";

/**
 * The dashboard's connection to the server (BUILD.md Phase 9).
 *
 * Two jobs, kept in one hook because they share a lifecycle: load what exists,
 * then subscribe to what happens next. The socket is opened per session and
 * closed on every change of session or unmount - a dashboard left open for an
 * afternoon must not accumulate sockets.
 *
 * Reconnection is deliberately modest: a fixed retry with a ceiling, and a
 * `live` flag that goes false the moment the socket drops. Showing stale
 * numbers under a LIVE badge would be worse than showing that the connection
 * went away.
 */

const RECONNECT_MS = 1_500;
const MAX_RECONNECTS = 20;
/**
 * How often the session LIST is refreshed.
 *
 * The stream carries everything about a session the dashboard is already
 * watching, but a session that did not exist when the page loaded cannot
 * announce itself down a socket nobody has opened yet. Polling one small
 * endpoint on loopback is the honest way to notice `observatory demo --stream`
 * starting up, and it is the only polling in the dashboard.
 */
const SESSION_POLL_MS = 4_000;

export type ConnectionStatus = "loading" | "ready" | "empty" | "unreachable" | "error";

export interface Observatory {
  readonly status: ConnectionStatus;
  readonly sessions: readonly SessionSummary[];
  readonly activeId: string | null;
  readonly snapshot: SessionSnapshot | null;
  /** True while the WebSocket is open. Never inferred from anything else. */
  readonly live: boolean;
  /** Events pushed over the socket since this dashboard connected. */
  readonly received: number;
  readonly error: string | null;
  select(id: string): void;
  refresh(): void;
}

export function useObservatory(): Observatory {
  const [status, setStatus] = useState<ConnectionStatus>("loading");
  const [sessions, setSessions] = useState<readonly SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [live, setLive] = useState(false);
  const [received, setReceived] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Kept in a ref so the socket effect does not re-run when the list changes.
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;

  /**
   * Whether to follow whichever session is newest.
   *
   * True until the reader picks one by hand. That is what makes "open the
   * dashboard, then run the demo" work, without ever yanking someone away from
   * a session they deliberately opened.
   */
  const followLatest = useRef(true);

  /* ------------------------------------------------------------ discovery */

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async (): Promise<void> => {
      try {
        const list = await fetchSessions(controller.signal);
        if (cancelled) return;

        setSessions(list);
        setError(null);

        if (list.length === 0) {
          setSnapshot(null);
          setActiveId(null);
          setStatus("empty");
          return;
        }

        // A session that is still running is what a developer just started;
        // otherwise the newest one. The list arrives newest-first.
        const newest = list.find((session) => session.status === "active") ?? list[0];
        const current = activeRef.current;
        const stillThere = current !== null && list.some((session) => session.id === current);

        if (!stillThere || (followLatest.current && newest !== undefined && newest.id !== current)) {
          setActiveId(newest?.id ?? null);
          setReceived(0);
        }
        setStatus("ready");
      } catch (cause: unknown) {
        if (cancelled || controller.signal.aborted) return;
        if (cause instanceof ApiUnreachableError) {
          setStatus("unreachable");
        } else {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : "unknown error");
        }
      } finally {
        if (!cancelled) timer = setTimeout(() => void load(), SESSION_POLL_MS);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      controller.abort();
    };
  }, [reloadToken]);

  /* -------------------------------------------------------------- session */

  useEffect(() => {
    if (activeId === null) return;

    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const next = await fetchSnapshot(activeId, controller.signal);
        if (!cancelled) {
          setSnapshot(next);
          setStatus("ready");
        }
      } catch (cause: unknown) {
        if (cancelled || controller.signal.aborted) return;
        if (cause instanceof ApiUnreachableError) setStatus("unreachable");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeId, reloadToken]);

  /* --------------------------------------------------------------- stream */

  useEffect(() => {
    if (activeId === null) return;

    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let closed = false;

    const open = (): void => {
      if (closed) return;

      socket = new WebSocket(streamUrl(activeId));

      socket.onopen = () => {
        attempts = 0;
        setLive(true);
      };

      socket.onmessage = (message: MessageEvent<string>) => {
        let parsed: StreamMessage;
        try {
          parsed = JSON.parse(message.data) as StreamMessage;
        } catch {
          return;
        }

        switch (parsed.type) {
          case "hello":
          case "snapshot":
            setSnapshot(parsed.snapshot);
            break;
          case "event":
            setReceived((count) => count + 1);
            break;
          case "session_ended":
            // The socket stays open; the session simply stopped producing.
            break;
          case "error":
            setError(parsed.message);
            break;
        }
      };

      socket.onclose = () => {
        setLive(false);
        if (closed || attempts >= MAX_RECONNECTS) return;
        attempts += 1;
        timer = setTimeout(open, RECONNECT_MS);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    open();

    return () => {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      // Detach handlers before closing so the close does not schedule a retry
      // for a session the dashboard has already navigated away from.
      if (socket !== null) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.onopen = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }
      setLive(false);
    };
  }, [activeId]);

  const select = useCallback((id: string) => {
    // A deliberate choice wins over the follow-the-newest rule for good.
    followLatest.current = false;
    setActiveId(id);
    setReceived(0);
  }, []);

  const refresh = useCallback(() => {
    followLatest.current = true;
    setReloadToken((token) => token + 1);
  }, []);

  return { status, sessions, activeId, snapshot, live, received, error, select, refresh };
}
