"use client";

import { OBSERVATORY_VERSION } from "@observatory/shared";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { apiLabel } from "@/lib/api";

/**
 * The frame around every view: header (BUILD.md section 36) and footer.
 *
 * The status indicator is passed in rather than decided here, because only the
 * component holding the socket knows whether the word LIVE is currently true.
 */
/** The two views. A third would want a real nav; two want two links. */
const NAV = [
  { href: "/", label: "Session" },
  { href: "/compare", label: "Compare" },
] as const;

export function AppShell({
  children,
  toolbar,
  status,
}: {
  children: ReactNode;
  toolbar?: ReactNode;
  status?: ReactNode;
}) {
  /*
   * Resolved after mount, not during render.
   *
   * With a same-origin build the address comes from `window.location`, which
   * does not exist while the page is being prerendered to a file. Rendering
   * nothing first and filling it in on the client avoids a hydration mismatch
   * over a line of footer text.
   */
  const [apiTarget, setApiTarget] = useState("");
  useEffect(() => {
    setApiTarget(apiLabel());
  }, []);

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

          <nav aria-label="Views" className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1.5 text-[12px] font-medium text-fg-faint transition-colors duration-300 hover:bg-fg/[0.04] hover:text-fg aria-[current=page]:text-clay-soft"
              >
                {item.label}
              </Link>
            ))}
          </nav>

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
            v{OBSERVATORY_VERSION}
            {apiTarget === "" ? null : ` · ${apiTarget}`}
          </p>
        </div>
      </footer>
    </div>
  );
}
