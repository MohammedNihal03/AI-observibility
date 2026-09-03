import type { CSSProperties } from "react";

import type { DashboardSession, TimelineKind } from "@/lib/dashboard-data";

import { Check, Cross, Dot, FileGlyph, PencilGlyph, TerminalGlyph } from "./icons";
import { Panel, SectionLabel } from "./ui";

/**
 * The activity timeline (BUILD.md section 62).
 *
 * The raw evidence, in the order it happened. Everything above this panel is
 * derived from these rows, so it is the last thing a sceptical reader checks -
 * which is why failures and recoveries are the only rows given colour.
 */

const KIND: Record<TimelineKind, { icon: typeof Dot; className: string }> = {
  start: { icon: Dot, className: "text-fg-faint" },
  prompt: { icon: Dot, className: "text-clay" },
  read: { icon: FileGlyph, className: "text-fg-faint" },
  edit: { icon: PencilGlyph, className: "text-fg-muted" },
  run: { icon: TerminalGlyph, className: "text-fg-muted" },
  pass: { icon: Check, className: "text-healthy" },
  fail: { icon: Cross, className: "text-danger" },
  end: { icon: Dot, className: "text-fg-faint" },
};

export function ActivityTimeline({ session }: { session: DashboardSession }) {
  return (
    <Panel delay={420} className="p-7 sm:p-8">
      <SectionLabel note={`last ${session.timeline.length} of ${session.eventCount} events`}>
        Activity
      </SectionLabel>

      {/* The mask fades the last row instead of slicing it in half, so a
          scrollable list reads as continuing rather than as broken. */}
      <ol
        className="scroll-slim mt-6 max-h-[420px] overflow-y-auto pr-2"
        style={{
          maskImage: "linear-gradient(to bottom, #000 92%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 92%, transparent 100%)",
        }}
      >
        {session.timeline.map((entry, index) => {
          const style = KIND[entry.kind];
          const Glyph = style.icon;
          const emphasised = entry.kind === "fail" || entry.kind === "pass";

          return (
            <li
              key={entry.id}
              className="rise group relative flex items-start gap-3 py-2 pl-1"
              style={{ "--rise-delay": `${Math.min(460 + index * 18, 900)}ms` } as CSSProperties}
            >
              {/* The rail: a hairline connecting the run of events. */}
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-[13px] top-0 w-px bg-border/70 group-first:top-1/2 group-last:bottom-1/2"
              />

              <span
                className={`relative z-10 mt-0.5 flex size-[26px] shrink-0 items-center justify-center rounded-full border border-border bg-surface ${style.className} ${
                  emphasised ? "border-current/30" : ""
                }`}
              >
                <Glyph className="size-3" />
              </span>

              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 pt-1">
                <span
                  className={`truncate font-mono text-[12.5px] ${
                    emphasised ? style.className : "text-fg-muted"
                  }`}
                  title={entry.detail ?? entry.label}
                >
                  {entry.label}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-faint">
                  {entry.at}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
