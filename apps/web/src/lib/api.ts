import type { SessionSnapshot, SessionSummary } from "@observatory/shared";

/**
 * The dashboard's only source of data (BUILD.md sections 31, 32).
 *
 * Phase 8 rendered sessions the page generated for itself. It no longer does:
 * the server owns every calculation, this file moves bytes, and the components
 * render whatever `SessionSnapshot` says. Nothing in the dashboard computes a
 * metric, so nothing in the dashboard can disagree with the API about one.
 */

export const API_BASE = (
  process.env.NEXT_PUBLIC_OBSERVATORY_API ?? "http://127.0.0.1:4000"
).replace(/\/$/u, "");

export class ApiUnreachableError extends Error {
  constructor() {
    super("Cannot reach the Observatory API");
    this.name = "ApiUnreachableError";
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...(signal !== undefined ? { signal } : {}),
      headers: { accept: "application/json" },
    });
  } catch {
    throw new ApiUnreachableError();
  }

  if (response.status === 404) throw new Error("not_found");
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchSessions(signal?: AbortSignal): Promise<readonly SessionSummary[]> {
  const body = await getJson<{ sessions: SessionSummary[] }>("/api/sessions?limit=25", signal);
  return body.sessions;
}

export function fetchSnapshot(id: string, signal?: AbortSignal): Promise<SessionSnapshot> {
  return getJson<SessionSnapshot>(`/api/sessions/${encodeURIComponent(id)}`, signal);
}

/** The stream endpoint, derived from the API base so one env var configures both. */
export function streamUrl(id: string): string {
  const base = API_BASE.replace(/^http/u, "ws");
  return `${base}/api/sessions/${encodeURIComponent(id)}/stream`;
}
