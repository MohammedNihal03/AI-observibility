"use client";

import type { SessionSummary } from "@observatory/shared";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * A session picker.
 *
 * Not a native `<select>`. Three things made that unworkable:
 *
 * 1. Its dropdown is drawn by the operating system, so the list appeared as a
 *    bright blue Windows widget in the middle of a dark theme.
 * 2. Option text cannot be truncated. One real session's goal was a pasted
 *    React component, and the dropdown stretched several thousand pixels off
 *    the side of the screen.
 * 3. Options cannot carry structure, so three sessions with the same goal were
 *    three identical rows.
 *
 * This is a listbox instead: one line per session, health and state and id in
 * fixed columns, goal truncated to whatever room is left.
 */

const STATE_MARK: Record<string, string> = {
  improving: "▲",
  stable: "●",
  degrading: "▼",
  insufficient_data: "·",
};

const STATE_TONE: Record<string, string> = {
  improving: "text-healthy",
  stable: "text-clay",
  degrading: "text-danger",
  insufficient_data: "text-fg-faint",
};

function Row({ session }: { session: SessionSummary }) {
  return (
    <>
      <span className={`w-3 shrink-0 text-center ${STATE_TONE[session.state] ?? "text-fg-faint"}`}>
        {STATE_MARK[session.state] ?? "·"}
      </span>
      <span className="w-7 shrink-0 text-right tabular-nums text-fg">{session.health ?? "--"}</span>
      <span className="w-[9ch] shrink-0 truncate text-fg-faint">{session.id.slice(-9)}</span>
      <span className="min-w-0 flex-1 truncate text-fg-muted">
        {session.goal ?? "no goal recorded"}
      </span>
      {session.simulated ? (
        <span className="shrink-0 text-[10px] uppercase tracking-widest text-border-strong">
          sim
        </span>
      ) : null}
    </>
  );
}

export function SessionSelect({
  sessions,
  value,
  onChange,
  label,
  className = "",
}: {
  sessions: readonly SessionSummary[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const selected = sessions.find((session) => session.id === value) ?? sessions[0];

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Close on a click anywhere else, and on Escape. Both listeners are removed
  // when the dropdown closes, so an open-and-closed picker leaves nothing behind.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent): void => {
      if (containerRef.current?.contains(event.target as Node) !== true) close();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const choose = (id: string): void => {
    onChange(id);
    close();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActive(
          Math.max(
            0,
            sessions.findIndex((session) => session.id === value),
          ),
        );
        setOpen(true);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(sessions.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const session = sessions[active];
      if (session !== undefined) choose(session.id);
    } else if (event.key === "Tab") {
      close();
    }
  };

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="glass flex w-full min-w-0 items-center gap-2.5 rounded-2xl px-4 py-2.5 text-left font-mono text-[12px] transition-colors duration-300 hover:border-border-strong"
      >
        {selected === undefined ? (
          <span className="text-fg-faint">No sessions</span>
        ) : (
          <Row session={selected} />
        )}
        <span
          aria-hidden="true"
          className={`ml-1 shrink-0 text-fg-faint transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          // Opaque, not `glass`. A translucent panel is right for a surface
          // that sits ON the page and wrong for one that floats OVER it: the
          // table underneath showed straight through the open list.
          className="scroll-slim absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-[320px] overflow-y-auto rounded-2xl border border-border-strong bg-surface-raised p-1.5 shadow-[0_28px_70px_-16px_rgb(0_0_0/0.85)]"
        >
          {sessions.map((session, index) => {
            const isSelected = session.id === value;
            return (
              <li key={session.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(session.id)}
                  onMouseEnter={() => setActive(index)}
                  className={`flex w-full min-w-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left font-mono text-[12px] transition-colors duration-150 ${
                    isSelected
                      ? "bg-clay/[0.12]"
                      : index === active
                        ? "bg-fg/[0.05]"
                        : "hover:bg-fg/[0.04]"
                  }`}
                >
                  <Row session={session} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
