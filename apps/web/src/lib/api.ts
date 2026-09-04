import type {
  GroupBy,
  GroupComparison,
  SessionComparison,
  SessionSnapshot,
  SessionSummary,
} from "@observatory/shared";

/**
 * The dashboard's only source of data (BUILD.md sections 31, 32).
 *
 * Phase 8 rendered sessions the page generated for itself. It no longer does:
 * the server owns every calculation, this file moves bytes, and the components
 * render whatever `SessionSnapshot` says. Nothing in the dashboard computes a
 * metric, so nothing in the dashboard can disagree with the API about one.
 */

/**
 * Where the API lives.
 *
 * Empty means "same origin": the packaged CLI serves the dashboard from the
 * API server itself, so `/api/...` resolves correctly whatever port the user
 * chose. A configured absolute URL is for development, where the dashboard runs
 * on its own port.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_OBSERVATORY_API ?? "").replace(/\/$/u, "");

/** The API address to show a human. "Same origin" is not a URL they can visit. */
export function apiLabel(): string {
  if (API_BASE !== "") return API_BASE;
  return typeof window === "undefined" ? "this server" : window.location.origin;
}

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

export function fetchComparison(
  left: string,
  right: string,
  signal?: AbortSignal,
): Promise<SessionComparison> {
  return getJson<SessionComparison>(
    `/api/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`,
    signal,
  );
}

export function fetchGroups(by: GroupBy, signal?: AbortSignal): Promise<GroupComparison> {
  return getJson<GroupComparison>(`/api/compare?by=${encodeURIComponent(by)}`, signal);
}

/** The stream endpoint, derived from the API base so one setting configures both. */
export function streamUrl(id: string): string {
  const base =
    API_BASE === ""
      ? // Same origin: build the socket address from the page itself, so a
        // dashboard served on any port talks to the API on that same port.
        `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
      : API_BASE.replace(/^http/u, "ws");
  return `${base}/api/sessions/${encodeURIComponent(id)}/stream`;
}
