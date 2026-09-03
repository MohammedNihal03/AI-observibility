const PREVIEW = [
  {
    label: "Agent Health",
    detail: "A 0–100 score with the reasons behind it — never a bare number.",
  },
  {
    label: "Behavioral Learning",
    detail: "Whether the agent is improving, stable or degrading within a session.",
  },
  {
    label: "Timeline",
    detail: "Every tool call, failure and recovery in the order it happened.",
  },
] as const;

/**
 * Dashboard empty state (BUILD.md section 60). It has to carry the product on
 * first run, so it explains what the tool will show rather than apologising for
 * having no data.
 */
export function EmptyState() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center text-center">
      <span aria-hidden="true" className="text-4xl">
        🧠
      </span>

      <h2 className="mt-6 text-2xl font-semibold tracking-tight text-fg">No sessions yet</h2>

      <p className="mt-3 max-w-md text-sm leading-relaxed text-fg-muted">
        Start a Claude Code or Codex session with the collector running, or generate a simulated
        session to see the dashboard with data.
      </p>

      <div className="mt-8 w-full rounded-lg border border-border bg-surface p-1">
        <div className="flex items-center gap-3 rounded-md bg-canvas px-4 py-3 text-left">
          <span aria-hidden="true" className="select-none font-mono text-sm text-fg-faint">
            $
          </span>
          <code className="overflow-x-auto whitespace-nowrap font-mono text-sm text-fg">
            observatory demo --scenario improving
          </code>
        </div>
      </div>

      <p className="mt-3 text-xs text-fg-faint">
        Simulated sessions are clearly labelled as simulated. They are never presented as observed
        agent telemetry.
      </p>

      <ul className="mt-12 grid w-full gap-3 text-left sm:grid-cols-3">
        {PREVIEW.map((item) => (
          <li
            key={item.label}
            className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <h3 className="text-xs font-semibold uppercase tracking-widest text-fg-muted">
              {item.label}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-fg-faint">{item.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
