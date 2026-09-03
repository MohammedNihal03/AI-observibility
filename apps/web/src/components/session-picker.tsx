"use client";

import type { SessionSummary } from "@observatory/shared";

import { SessionSelect } from "./session-select";

/**
 * The header's session picker.
 *
 * A thin wrapper around the shared listbox. It was a native `<select>`, which
 * the operating system draws itself: an unthemed dropdown, no way to truncate a
 * goal that happened to be a pasted file, and no way to tell three sessions
 * with the same goal apart.
 */
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
    <SessionSelect
      label="Session"
      sessions={sessions}
      value={activeId ?? ""}
      onChange={onSelect}
      className="w-full sm:w-[38ch]"
    />
  );
}
