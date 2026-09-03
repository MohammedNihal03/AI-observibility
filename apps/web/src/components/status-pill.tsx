"use client";

import type { SessionSnapshot } from "@observatory/shared";

/**
 * The header status indicator (BUILD.md section 61).
 *
 * LIVE means one specific thing: the WebSocket is open AND the session has not
 * ended. It is never inferred from recent data or from the fact that a demo is
 * running. A dashboard that says LIVE while showing a frozen number is worse
 * than one that admits it lost the connection.
 */
export function StatusPill({
  snapshot,
  live,
}: {
  snapshot: SessionSnapshot | null;
  live: boolean;
}) {
  const active = snapshot !== null && snapshot.session.status === "active";
  const streaming = live && active;

  const [dot, text, tone] = streaming
    ? ["bg-healthy", "Live", "border-healthy/30 bg-healthy/[0.08] text-healthy"]
    : live
      ? ["bg-clay", "Connected", "border-clay/25 bg-clay/[0.07] text-clay-soft"]
      : snapshot === null
        ? ["bg-fg-faint", "Offline", "border-border bg-surface text-fg-faint"]
        : ["bg-fg-faint", "Recorded", "border-border bg-surface text-fg-faint"];

  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${tone}`} role="status">
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${dot}`}
        style={streaming ? { animation: "breathe 1.6s ease-in-out infinite" } : undefined}
      />
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em]">{text}</span>
      {snapshot?.session.simulated === true ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">
          · simulated
        </span>
      ) : null}
    </div>
  );
}
