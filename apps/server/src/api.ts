/**
 * The server package's public surface.
 *
 * Deliberately not `index.ts`: that file is the binary and starts listening on
 * import. Anything importing this module gets the building blocks and decides
 * for itself when to open a socket.
 */

export { createApp, type CreateAppOptions, type HealthResponse } from "./app.js";
export { loadConfig, type ServerConfig } from "./config.js";
export { startServer, PortInUseError, type RunningServer, type StartOptions } from "./start.js";
export { createDatabase, type DatabaseHandle } from "./db/client.js";
export { createStore, type Store } from "./db/store.js";
export {
  compareGroups,
  compareSessions,
  type GroupBy,
  type GroupComparison,
  type GroupStats,
  type MetricDelta,
  type SessionComparison,
} from "./compare.js";
