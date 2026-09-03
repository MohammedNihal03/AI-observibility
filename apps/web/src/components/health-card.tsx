import type { SessionSnapshot } from "@observatory/shared";

import { TrendDown, TrendFlat, TrendUp } from "./icons";
import { Meter, Panel, SectionLabel, TONE_TEXT, toneForState, Value } from "./ui";

/**
 * The hero card (BUILD.md section 37).
 *
 * Two numbers, and they answer different questions. HEALTH is how the session
 * is doing right now; the STATE beside it is which way it is moving. A session
 * can be at 74 and improving, or at 82 and flat, and collapsing the two into
 * one figure would lose the only thing a developer can act on.
 *
 * The component breakdown underneath is not ornament: section 27 forbids
 * showing `Health = 74` without saying where the 74 came from.
 */

const STATE_COPY: Record<string, { label: string; blurb: string }> = {
  improving: { label: "Improving", blurb: "behaviour got better across the session" },
  stable: { label: "Stable", blurb: "no meaningful trend in either direction" },
  degrading: { label: "Degrading", blurb: "behaviour got worse across the session" },
  insufficient_data: { label: "Not enough data", blurb: "too few actions to judge a trend" },
};

function StateIcon({ state, className }: { state: string; className: string }) {
  if (state === "improving") return <TrendUp className={className} />;
  if (state === "degrading") return <TrendDown className={className} />;
  return <TrendFlat className={className} />;
}

export function HealthCard({ snapshot }: { snapshot: SessionSnapshot }) {
  const { scores } = snapshot;
  const tone = toneForState(scores.state);
  const copy = STATE_COPY[scores.state] ?? STATE_COPY["insufficient_data"]!;

  return (
    <Panel edge bloom delay={60} className="p-7 sm:p-9">
      <SectionLabel note={`${scores.measuredComponents} of 5 components measured`}>
        Agent health
      </SectionLabel>

      <div className="mt-7 flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex items-end gap-2">
          <Value className="text-[5.5rem] font-medium leading-[0.82] text-fg sm:text-[6.5rem]">
            {scores.health ?? "n/a"}
          </Value>
          <span className="pb-2 font-mono text-sm text-fg-faint">/100</span>
        </div>

        <div className="flex flex-col gap-1.5 pb-2">
          <div className={`flex items-center gap-2 ${TONE_TEXT[tone]}`}>
            <StateIcon state={scores.state} className="size-4" />
            <span className="text-sm font-medium tracking-tight">{copy.label}</span>
            {scores.learningDelta !== null ? (
              <Value className="text-xs opacity-70">
                {scores.learningDelta > 0 ? "+" : ""}
                {(scores.learningDelta * 100).toFixed(1)} pts
              </Value>
            ) : null}
          </div>
          <p className="max-w-[24ch] text-xs leading-relaxed text-fg-faint">{copy.blurb}</p>
        </div>
      </div>

      <p className="mt-6 text-sm capitalize text-fg-muted">
        <span className="text-fg-faint">Band</span> {scores.healthState.replace("_", " ")}
        <span className="mx-2 text-border-strong">/</span>
        <span className="text-fg-faint">Degradation</span>{" "}
        <Value>{scores.degradation ?? "n/a"}</Value>
        <span className="text-fg-faint">/100</span>
      </p>

      <ul className="mt-8 grid gap-4 border-t border-border pt-7 sm:grid-cols-2">
        {scores.healthComponents.map((component) => (
          <li key={component.name} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-fg-muted">{component.name}</span>
              <Value className="text-xs text-fg">
                {component.value === null ? (
                  <span className="text-fg-faint">n/a</span>
                ) : (
                  `${Math.round(component.value * 100)}%`
                )}
              </Value>
            </div>
            <Meter value={component.value} tone={component.value === null ? "neutral" : "clay"} />
            <span className="text-[10px] uppercase tracking-widest text-fg-faint">
              {component.weight === 0
                ? "excluded"
                : `weight ${Math.round(component.weight * 100)}%`}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
