import type { Metadata } from "next";

import { CompareApp } from "@/components/compare-app";

export const metadata: Metadata = { title: "Compare" };

/**
 * Session, model and prompt comparison (BUILD.md section 65, V2).
 *
 * A static shell like the dashboard: every byte arrives from the local API on
 * the client, so one code path feeds the first paint and every later change.
 */
export default function Page() {
  return <CompareApp />;
}
