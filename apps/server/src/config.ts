/**
 * Server configuration.
 *
 * Local-first (BUILD.md section 7 / 48): the default bind address is the
 * loopback interface, not 0.0.0.0. Telemetry collected from a developer's
 * machine should not become reachable from the local network by accident.
 *
 * Ports: API on 4000, dashboard on 4001.
 */
export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  /** Origins allowed to call the API. The dashboard dev server by default. */
  readonly allowedOrigins: readonly string[];
}

const DEFAULT_PORT = 4000;

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_PORT;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid OBSERVATORY_PORT: ${value}`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = readPort(env.OBSERVATORY_PORT);
  return {
    host: env.OBSERVATORY_HOST ?? "127.0.0.1",
    port,
    allowedOrigins: [
      // The dashboard runs on a dedicated port so it cannot collide with the
      // many other dev servers that squat on 3000.
      "http://localhost:4001",
      "http://127.0.0.1:4001",
      ...(env.OBSERVATORY_ALLOWED_ORIGINS?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean) ?? []),
    ],
  };
}
