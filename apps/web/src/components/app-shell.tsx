import { OBSERVATORY_VERSION } from "@observatory/shared";
import Image from "next/image";
import type { ReactNode } from "react";

/**
 * The frame around every view: header (BUILD.md section 36) and footer.
 *
 * The status pill says SIMULATED, not LIVE. Phase 9 connects the WebSocket and
 * earns the live indicator; until then, claiming it would be the exact kind of
 * confident falsehood this product exists to prevent.
 */
/**
 * The status pill. Rendered by the caller rather than by the shell, so a view
 * with no session cannot accidentally advertise one.
 */
export function SimulatedPill() {
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-clay/25 bg-clay/[0.07] px-3 py-1.5"
      role="status"
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-clay"
        style={{ animation: "breathe 2.4s ease-in-out infinite" }}
      />
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-clay-soft">
        Simulated
      </span>
    </div>
  );
}

export function AppShell({
  children,
  toolbar,
  status,
}: {
  children: ReactNode;
  toolbar?: ReactNode;
  status?: ReactNode;
}) {
  const apiTarget = process.env.NEXT_PUBLIC_OBSERVATORY_API ?? "http://127.0.0.1:4000";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-canvas/60 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="relative flex size-8 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-clay/20 blur-md" />
              <Image
                src="/brand/claude-mark.png"
                alt=""
                width={28}
                height={28}
                className="relative"
                priority
              />
            </span>
            <div className="leading-tight">
              <p className="text-[13px] font-medium tracking-tight text-fg">AI Agent Observatory</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                Behavioral telemetry
              </p>
            </div>
          </div>

          <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto">{toolbar}</div>

          {status === undefined ? null : <div className="ml-auto sm:ml-0">{status}</div>}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {children}
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-4 py-5 text-[11px] text-fg-faint sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            Local-first. Nothing leaves this machine.{" "}
            <span className="text-fg-muted">
              Behavioral metrics only &mdash; not model weights, gradients or loss.
            </span>
          </p>
          <p className="font-mono">
            v{OBSERVATORY_VERSION} &middot; {apiTarget}
          </p>
        </div>
      </footer>
    </div>
  );
}
