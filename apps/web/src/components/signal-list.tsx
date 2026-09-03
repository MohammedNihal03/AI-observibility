import type { CSSProperties } from "react";

import type { SessionSnapshot } from "@observatory/shared";

import { Alert, Dot, SparkGlyph } from "./icons";
import { Panel, SectionLabel } from "./ui";

/**
 * Behaviour signals (BUILD.md sections 23, 51).
 *
 * A signal is an observation with its evidence attached - "npm test failed 7
 * times in a row" - not a conclusion about what caused it. The severity chip is
 * the engine's, and context pressure never appears here as a cause of anything.
 */

const SEVERITY = {
  critical: { className: "text-danger", ring: "bg-danger/10 text-danger", icon: Alert },
  warning: { className: "text-warn", ring: "bg-warn/10 text-warn", icon: Alert },
  info: { className: "text-fg-muted", ring: "bg-fg/[0.06] text-fg-muted", icon: Dot },
} as const;

export function SignalList({ snapshot }: { snapshot: SessionSnapshot }) {
  return (
    <Panel delay={360} className="p-7 sm:p-8">
      <SectionLabel note={snapshot.signals.length > 0 ? `${snapshot.signals.length} raised` : null}>
        Behaviour signals
      </SectionLabel>

      {snapshot.signals.length === 0 ? (
        <div className="mt-8 flex flex-1 flex-col items-start gap-3">
          <SparkGlyph className="size-5 text-fg-faint" />
          <p className="text-sm leading-relaxed text-fg-muted">
            No signals raised. Nothing in this session crossed a threshold worth interrupting you
            for.
          </p>
        </div>
      ) : (
        <ul
          className="scroll-slim mt-6 flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1"
          style={{
            maskImage: "linear-gradient(to bottom, #000 92%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 92%, transparent 100%)",
          }}
        >
          {snapshot.signals.map((signal, index) => {
            const style = SEVERITY[signal.severity];
            const Glyph = style.icon;
            return (
              <li
                key={`${signal.type}-${signal.message}`}
                className="rise flex items-start gap-3 rounded-2xl border border-border/70 bg-canvas/40 p-3.5 transition-colors duration-300 hover:border-border-strong"
                style={{ "--rise-delay": `${400 + index * 50}ms` } as CSSProperties}
              >
                <span
                  className={`mt-px flex size-6 shrink-0 items-center justify-center rounded-lg ${style.ring}`}
                >
                  <Glyph className="size-3" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug text-fg-muted">{signal.message}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-fg-faint">
                    {signal.type.replace(/_/gu, " ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
