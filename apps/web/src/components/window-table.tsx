import type { CSSProperties } from "react";

import type { SessionSnapshot } from "@observatory/shared";

import { Panel, SectionLabel, Value } from "./ui";

/**
 * The three windows the verdict is computed from (BUILD.md section 21).
 *
 * This is the audit trail for the headline state. A developer who does not
 * believe "improving" can read the three rows the engine compared and check the
 * claim, which is the whole difference between a score and an assertion.
 */

const COLUMNS = [
  { key: "errorRate", label: "Errors" },
  { key: "recoveryRate", label: "Recovery" },
  { key: "repetitionRate", label: "Repeat" },
  { key: "goalAdherence", label: "On goal" },
] as const;

function cell(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

export function WindowTable({ snapshot }: { snapshot: SessionSnapshot }) {
  return (
    <Panel delay={300} className="p-7 sm:p-8">
      <SectionLabel note="early / middle / recent">Session windows</SectionLabel>

      {/* The table scrolls inside its own container rather than crushing four
          numeric columns into a phone's width. */}
      <div className="scroll-slim mt-6 -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[380px] border-collapse text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.14em] text-fg-faint">
              <th className="pb-3 font-medium">Window</th>
              {COLUMNS.map((column) => (
                <th key={column.key} className="pb-3 text-right font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {snapshot.windows.map((window, index) => (
              <tr
                key={window.label}
                className="rise transition-colors duration-300 hover:bg-fg/[0.02]"
                style={{ "--rise-delay": `${340 + index * 70}ms` } as CSSProperties}
              >
                <td className="py-3.5">
                  <span className="text-[13px] capitalize text-fg">{window.label}</span>
                  <span className="ml-2 font-mono text-[11px] text-fg-faint">
                    {window.actions} acts
                  </span>
                </td>
                {COLUMNS.map((column) => (
                  <td key={column.key} className="py-3.5 text-right">
                    <Value className="text-[13px] text-fg-muted">{cell(window[column.key])}</Value>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-7 border-t border-border pt-6 text-[11px] leading-relaxed text-fg-faint">
        The session split into three windows by action count, not by clock time. The verdict above
        is the comparison between these rows, so it can be checked against them.
      </p>
    </Panel>
  );
}
