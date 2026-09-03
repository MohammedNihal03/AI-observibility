import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";

/**
 * PHASE 1 (current): the shell plus the empty state. No data fetching yet -
 * there is no API to fetch from, and a fake loading state would be dishonest.
 * PHASE 8 replaces the body with the health card, learning chart, metric cards,
 * behavior panel and timeline. PHASE 9 connects the WebSocket.
 */
export default function Page() {
  return (
    <AppShell>
      <EmptyState />
    </AppShell>
  );
}
