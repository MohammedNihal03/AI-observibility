import { OBSERVATORY_VERSION } from "@observatory/shared";
import type { ReactNode } from "react";

/**
 * The persistent frame around every dashboard view: header (BUILD.md section
 * 36) and footer. In Phase 1 the header shows the offline state; Phase 9
 * replaces the static pill with the live WebSocket indicator.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const apiTarget = process.env.NEXT_PUBLIC_OBSERVATORY_API ?? "http://127.0.0.1:4000";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="text-lg leading-none">
              🧠
            </span>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold tracking-tight text-fg">AI Agent Observatory</h1>
              <p className="text-xs text-fg-faint">Agent behavioral telemetry</p>
            </div>
          </div>

          <div
            className="flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5"
            role="status"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-fg-faint" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-fg-muted">
              No sessions
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-4 text-xs text-fg-faint sm:flex-row sm:items-center sm:justify-between">
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
