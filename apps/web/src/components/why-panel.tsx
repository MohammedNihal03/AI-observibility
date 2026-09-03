import type { SessionSnapshot } from "@observatory/shared";

import { Alert, Check, Cross, Dot } from "./icons";
import { Panel, SectionLabel } from "./ui";

/**
 * "Why is the agent improving / degrading?" (BUILD.md sections 38, 39).
 *
 * Every line here was generated from a measured change by the behavioural
 * engine. There is no prose in this component - it renders reasons, it does not
 * write them. If the engine measured nothing, the panel says so rather than
 * inventing encouragement.
 */

const REASON_STYLE = {
  positive: { icon: Check, className: "text-healthy" },
  negative: { icon: Cross, className: "text-danger" },
  warning: { icon: Alert, className: "text-warn" },
  neutral: { icon: Dot, className: "text-fg-faint" },
} as const;

const TITLE: Record<string, string> = {
  improving: "Why the agent is improving",
  stable: "Why the agent is stable",
  degrading: "Why the agent is degrading",
  insufficient_data: "Why there is no verdict yet",
};

export function WhyPanel({ snapshot }: { snapshot: SessionSnapshot }) {
  return (
    <Panel delay={120} className="p-7 sm:p-8">
      <SectionLabel note={`${snapshot.reasons.length} measured`}>
        {TITLE[snapshot.scores.state] ?? "Why"}
      </SectionLabel>

      {snapshot.reasons.length === 0 ? (
        <p className="mt-6 text-sm leading-relaxed text-fg-muted">
          Nothing measurable changed across the session. The engine reports no reasons rather than
          filling the space with a guess.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col divide-y divide-border/70">
          {snapshot.reasons.map((reason, index) => {
            const style = REASON_STYLE[reason.type];
            const Glyph = style.icon;
            return (
              <li
                key={reason.message}
                className="rise flex items-start gap-3 py-3.5 first:pt-0 last:pb-0"
                style={{ "--rise-delay": `${180 + index * 55}ms` } as React.CSSProperties}
              >
                <Glyph className={`mt-0.5 size-3.5 shrink-0 ${style.className}`} />
                <span className="text-[13px] leading-relaxed text-fg-muted">{reason.message}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto border-t border-border pt-5">
        <p className="text-[11px] leading-relaxed text-fg-faint">
          Reasons are generated from measured deltas between the early, middle and recent thirds of
          the session. A change smaller than 5 points is not reported.
        </p>
      </div>
    </Panel>
  );
}
