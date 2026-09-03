import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { schema } from "./schema.js";

export type ObservatoryDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  readonly db: ObservatoryDatabase;
  /** The underlying driver, for pragmas and integrity checks. */
  readonly sqlite: Database.Database;
  readonly file: string;
  close(): void;
}

export interface CreateDatabaseOptions {
  /** Path to the SQLite file, or ":memory:". Defaults to `data/observatory.db`. */
  readonly file?: string;
  /** Migration directory. Defaults to `database/migrations` at the repo root. */
  readonly migrationsFolder?: string;
  /** Apply pending migrations on open. Defaults to true. */
  readonly migrate?: boolean;
}

const MEMORY = ":memory:";

/**
 * `apps/server/{src,dist}/db/client.* ` is four levels below the repo root, and
 * src and dist sit at the same depth, so one expression serves dev and build.
 */
function defaultMigrationsFolder(): string {
  return fileURLToPath(new URL("../../../../database/migrations", import.meta.url));
}

function defaultDatabaseFile(): string {
  return fileURLToPath(new URL("../../../../data/observatory.db", import.meta.url));
}

/**
 * Opens the local database.
 *
 * Pragmas are set deliberately:
 *
 * - `journal_mode = WAL` so a reader (the dashboard) never blocks the writer
 *   (the collector). Telemetry ingestion must not stall behind a page refresh.
 * - `foreign_keys = ON` because SQLite disables them per connection by default,
 *   and the cascade from sessions to events is load-bearing.
 * - `busy_timeout` so a brief lock retries instead of throwing.
 * - `synchronous = NORMAL`: this is local observability data, not accounting.
 *   Losing the last few events to a power cut is acceptable; fsyncing on every
 *   event is not (section 49).
 */
export function createDatabase(options: CreateDatabaseOptions = {}): DatabaseHandle {
  const file = options.file ?? defaultDatabaseFile();

  if (file !== MEMORY) {
    mkdirSync(dirname(resolve(file)), { recursive: true });
  }

  const sqlite = new Database(file);

  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  if (file !== MEMORY) {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
  }

  const db = drizzle(sqlite, { schema });

  if (options.migrate !== false) {
    migrate(db, { migrationsFolder: options.migrationsFolder ?? defaultMigrationsFolder() });
  }

  return {
    db,
    sqlite,
    file,
    close(): void {
      sqlite.close();
    },
  };
}

/** Runs SQLite's integrity check. Used by `observatory doctor` in Phase 10. */
export function checkIntegrity(handle: DatabaseHandle): { ok: boolean; details: string } {
  const rows = handle.sqlite.pragma("integrity_check") as { integrity_check: string }[];
  const details = rows.map((row) => row.integrity_check).join("; ");
  return { ok: details === "ok", details };
}
