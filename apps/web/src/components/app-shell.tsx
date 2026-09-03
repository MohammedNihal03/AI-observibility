import { OBSERVATORY_VERSION } from "@observatory/shared";
import Image from "next/image";
import type { ReactNode } from "react";

/**
 * The frame around every view: header (BUILD.md section 36) and footer.
 *
 * The status indicator is passed in rather than decided here, because only the
 * component holding the socket knows whether the word LIVE is currently true.
 */
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
