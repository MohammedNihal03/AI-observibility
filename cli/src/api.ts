import type { AgentEventInput, SessionRecord } from "@observatory/shared";

/**
 * A minimal client for the local API (BUILD.md section 32).
 *
 * Deliberately built on `fetch` with no HTTP library: the CLI talks to one
 * server, on loopback, with four endpoints. A dependency here would be more
 * code to keep current than the code it replaces.
 */

export const DEFAULT_SERVER = "http://127.0.0.1:4000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ServerUnreachableError extends Error {
  constructor(readonly server: string) {
    super(
      `Cannot reach the Observatory API at ${server}.\n` +
        `Start it with \`npm run dev\` (or \`npm run dev:server\`) and try again.`,
    );
    this.name = "ServerUnreachableError";
  }
}

async function request<T>(server: string, path: string, init?: RequestInit): Promise<T> {
  const url = `${server.replace(/\/$/u, "")}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    // Connection refused, DNS failure, TLS - all mean the same thing to a user
    // running this locally, and the fix is the same.
    throw new ServerUnreachableError(server);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ApiError(response.status, url, `${response.status} ${response.statusText} ${detail}`);
  }

  return (await response.json()) as T;
}

export interface ApiClient {
  readonly server: string;
  health(): Promise<{ status: string; version: string; database: { sessions: number } }>;
  createSession(input: Record<string, unknown>): Promise<SessionRecord>;
  sendEvent(sessionId: string, event: AgentEventInput): Promise<{ accepted: number }>;
  sendEvents(
    sessionId: string,
    events: readonly AgentEventInput[],
  ): Promise<{ accepted: number; redactions: number }>;
  endSession(sessionId: string): Promise<SessionRecord>;
}

export function createApiClient(server: string = DEFAULT_SERVER): ApiClient {
  return {
    server,

    health() {
      return request(server, "/api/health");
    },

    createSession(input) {
      return request(server, "/api/sessions", { method: "POST", body: JSON.stringify(input) });
    },

    sendEvent(sessionId, event) {
      return request(server, `/api/sessions/${encodeURIComponent(sessionId)}/events`, {
        method: "POST",
        body: JSON.stringify(event),
      });
    },

    sendEvents(sessionId, events) {
      return request(server, `/api/sessions/${encodeURIComponent(sessionId)}/events`, {
        method: "POST",
        body: JSON.stringify({ events }),
      });
    },

    endSession(sessionId) {
      return request(server, `/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed", endedAt: new Date().toISOString() }),
      });
    },
  };
}
