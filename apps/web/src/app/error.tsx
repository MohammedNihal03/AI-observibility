"use client";

import { useEffect } from "react";

import { Alert } from "@/components/icons";
import { Panel } from "@/components/ui";

/**
 * The dashboard's error boundary (BUILD.md Phase 13).
 *
 * Without this, a render error in any panel replaces the whole page with a
 * blank screen and the reason goes only to the console. A tool whose entire
 * purpose is explaining failure should not fail silently.
 *
 * `digest` is included because Next replaces the message with an opaque id in
 * production builds, and that id is the only thing tying what the user sees to
 * what the server logged.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("dashboard render failed:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[1400px] items-center px-4 sm:px-6 lg:px-8">
      <Panel edge className="w-full max-w-2xl p-8 sm:p-12">
        <span className="flex size-10 items-center justify-center rounded-2xl border border-danger/30 bg-danger/[0.08] text-danger">
          <Alert className="size-4" />
        </span>

        <h1 className="mt-8 text-balance text-3xl font-medium leading-[1.08] tracking-tight text-fg">
          The dashboard hit an error
        </h1>

        <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-fg-muted">
          Your session data is unaffected — it lives in the local database, not in this page. This
          is a bug in the dashboard itself.
        </p>

        {error.message !== "" ? (
          <pre className="scroll-slim mt-6 overflow-x-auto rounded-2xl border border-border bg-canvas/60 p-4 font-mono text-[12px] leading-relaxed text-fg-muted">
            {error.message}
            {error.digest === undefined ? "" : `\n\ndigest ${error.digest}`}
          </pre>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-clay/30 bg-clay/[0.1] px-4 py-2 text-[12px] font-medium text-clay-soft transition-colors duration-300 hover:bg-clay/[0.16] active:scale-[0.98]"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-full border border-border bg-surface px-4 py-2 text-[12px] font-medium text-fg-muted transition-colors duration-300 hover:border-border-strong hover:text-fg"
          >
            Reload the dashboard
          </a>
        </div>
      </Panel>
    </main>
  );
}
