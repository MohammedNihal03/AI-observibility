import type { CSSProperties, ReactNode } from "react";

/**
 * Shared surface primitives.
 *
 * One definition of "a pane of glass" and "a section label", so that twelve
 * panels cannot slowly drift into twelve slightly different radii.
 */

export type Tone = "neutral" | "healthy" | "warn" | "danger" | "clay";

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg-muted",
  healthy: "text-healthy",
  warn: "text-warn",
  danger: "text-danger",
  clay: "text-clay",
};

export const TONE_BG: Record<Tone, string> = {
  neutral: "bg-fg-faint",
  healthy: "bg-healthy",
  warn: "bg-warn",
  danger: "bg-danger",
  clay: "bg-clay",
};

/** Health bands to tone. The bands themselves live in `@observatory/shared`. */
export function toneForState(state: string): Tone {
  switch (state) {
    case "healthy":
    case "improving":
      return "healthy";
    case "stable":
      return "clay";
    case "warning":
      return "warn";
    case "degrading":
      return "danger";
    default:
      return "neutral";
  }
}

interface PanelProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Adds the travelling edge light. Reserved for surfaces that lead a view. */
  readonly edge?: boolean;
  readonly bloom?: boolean;
  readonly delay?: number;
  readonly style?: CSSProperties;
}

export function Panel({ children, className = "", edge, bloom, delay = 0, style }: PanelProps) {
  return (
    <section
      className={[
        "glass rise relative overflow-hidden rounded-3xl",
        edge === true ? "glass-edge" : "",
        bloom === true ? "glass-bloom" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--rise-delay": `${delay}ms`, ...style } as CSSProperties}
    >
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </section>
  );
}

export function SectionLabel({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-[10px] font-medium uppercase tracking-[0.18em] text-fg-faint">
        {children}
      </h2>
      {note !== undefined ? <span className="text-[11px] text-fg-faint">{note}</span> : null}
    </div>
  );
}

/** A thin measurement bar. `value` is 0-1; null renders the track alone. */
export function Meter({
  value,
  tone = "clay",
  className = "",
}: {
  value: number | null;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={`h-px w-full bg-border ${className}`}>
      {value === null ? null : (
        <div
          className={`h-px origin-left ${TONE_BG[tone]}`}
          style={{
            width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`,
            animation: "draw-in 900ms var(--ease-out-expo) both",
          }}
        />
      )}
    </div>
  );
}

/** "n/a" is a real answer here, and it must never be rendered as a zero. */
export function Value({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-mono tabular-nums tracking-tight ${className}`}>
      {children ?? <span className="text-fg-faint">n/a</span>}
    </span>
  );
}
