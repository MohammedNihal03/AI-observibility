import { AppShell, SimulatedPill } from "@/components/app-shell";
import { DashboardBody } from "@/components/dashboard-body";
import { ScenarioProvider } from "@/components/scenario-provider";
import { ScenarioSwitcher } from "@/components/scenario-switcher";
import { loadScenarios } from "@/lib/dashboard-data";

/**
 * PHASE 8 (current): the full dashboard, rendered from sessions the demo
 * generator produces and the real engine scores. There is no API to fetch from
 * yet, and a dashboard that could only be seen with an agent attached could not
 * be built at all.
 *
 * PHASE 7 swaps `loadScenarios` for a fetch against `/api/sessions`; PHASE 9
 * subscribes to the WebSocket and the status pill earns the word LIVE. Neither
 * touches a component below this file - they all consume `DashboardSession`.
 */

// The simulated sessions are timestamped relative to the request, so the
// timeline reads as something that just happened rather than a fixed date in
// the generator's past.
export const dynamic = "force-dynamic";

const SESSION_SPAN_MS = 4 * 60 * 1_000;

export default function Page() {
  const sessions = loadScenarios(new Date(Date.now() - SESSION_SPAN_MS).toISOString());

  return (
    <ScenarioProvider sessions={sessions}>
      <AppShell
        toolbar={sessions.length > 0 ? <ScenarioSwitcher /> : null}
        status={sessions.length > 0 ? <SimulatedPill /> : null}
      >
        <DashboardBody />
      </AppShell>
    </ScenarioProvider>
  );
}
