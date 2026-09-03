"use client";

import type { SessionSummary } from "@observatory/shared";

/**
 * Switches between recorded sessions.
 *
 * A select rather than a row of pills: the number of sessions is unbounded once
 * an agent is actually being observed, and a control that works for three and
 * breaks at thirty is not a control.
 */

const STATE_MARK: Record<string, string> = {
  improving: "▲",
  degrading: "▼",
  stable: "●",
  insufficient_data: "·",
};

function label(session: SessionSummary): string {
  const mark = STATE_MARK[session.state] ?? "·";
  const health = session.health === null ? "--" : String(session.health).padStart(2, " ");
  const name = session.goal ?? session.id;
  const trimmed = name.length > 42 ? `${name.slice(0, 41)}…` : name;
  return `${mark} ${health}  ${trimmed}`;
}

export function SessionPicker({
  sessions,
  activeId,
  onSelect,
}: {
  sessions: readonly SessionSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <label className="glass flex w-full items-center gap-3 rounded-full py-1.5 pl-4 pr-2 sm:w-auto">
      <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">
        Session
      </span>
      <select
        value={activeId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        className="w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-6 font-mono text-[12px] text-fg-muted outline-none transition-colors duration-300 hover:text-fg sm:w-[26ch]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237d8492' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 4px center",
        }}
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id} className="bg-surface text-fg">
            {label(session)}
          </option>
        ))}
      </select>
    </label>
  );
}
