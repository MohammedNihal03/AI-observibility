import { DashboardApp } from "@/components/dashboard-app";

/**
 * PHASE 9 (current): the dashboard reads the local API and subscribes to the
 * session stream, so `observatory demo --stream` fills it in as the events
 * arrive (BUILD.md sections 31, 61).
 *
 * There is no server-side fetch here on purpose. The page is a static shell and
 * every byte of data arrives over the socket or the API from the client, which
 * means one code path feeds the first paint and every later update - and no
 * chance of a server-rendered number disagreeing with a live one.
 */
export default function Page() {
  return <DashboardApp />;
}
