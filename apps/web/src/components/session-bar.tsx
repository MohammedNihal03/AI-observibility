import type { SessionSnapshot } from "@observatory/shared";
import Image from "next/image";
import type { CSSProperties } from "react";

import { duration } from "@/lib/tiles";

import { Value } from "./ui";

/**
 * Session identity (BUILD.md sections 36, 61: what is running, for how long,
 * how much has arrived).
 *
 * Not a card. It is a caption for everything below it, so it gets a hairline
 * and space rather than a box and a shadow.
 */
export function SessionBar({
  snapshot,
  received,
  live,
}: {
  snapshot: SessionSnapshot;
  received: number;
  live: boolean;
}) {
  const { session, scores } = snapshot;
  const shortId = session.id.slice(-4).toUpperCase();

  return (
    <div
      className="rise flex flex-col gap-5 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between"
      style={{ "--rise-delay": "0ms" } as CSSProperties}
    >
      <div className="flex items-start gap-4">
        <span className="relative mt-1 hidden size-10 shrink-0 items-center justify-center sm:flex">
          <span className="absolute inset-0 rounded-xl bg-clay/15 blur-lg" />
          <Image
            src="/brand/claude-code-mark.png"
            alt=""
            width={34}
            height={34}
            className="relative opacity-90"
          />
        </span>

        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl font-medium tracking-tight text-fg sm:text-2xl">
              {session.goal ?? "Untitled session"}
            </h1>
            {session.simulated ? (
              <span className="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-faint">
                simulated
              </span>
            ) : null}
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-fg-faint">
            <span className="text-fg-muted">{session.source.replace("_", " ")}</span>
            <span className="text-border-strong">/</span>
            <span>{session.model ?? "model unknown"}</span>
            <span className="text-border-strong">/</span>
            <span>#{shortId}</span>
          </p>
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {[
          { label: "Duration", value: duration(session.durationMs) },
          {
            label: "Events",
            // While the socket is open, say how many arrived while watching -
            // section 61 asks for exactly that.
            value: live ? `${session.eventCount} (+${received})` : String(session.eventCount),
          },
          { label: "Learning", value: `${scores.learning ?? "n/a"}/100` },
        ].map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <dt className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">{item.label}</dt>
            <dd>
              <Value className="text-sm text-fg-muted">{item.value}</Value>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
