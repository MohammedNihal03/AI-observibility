import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where the CLI is running from, and what ships beside it.
 *
 * The same code runs two ways: out of a repository checkout during development,
 * and out of a single bundled file after `npm install -g`. Three things differ
 * between them, and each one is a real bug if it is guessed wrong.
 *
 * - **The dashboard.** Installed, it ships inside the package and the API
 *   serves it. In a checkout it is a separate dev server on another port.
 * - **The migrations.** Their default location resolves relative to the server
 *   source file, which is four directories deep in a checkout and nowhere at
 *   all in a bundle.
 * - **The database.** In a checkout it belongs in `data/` next to the code. An
 *   installed CLI must NOT write inside its own installation: `node_modules` is
 *   replaced wholesale on upgrade, and a user's recorded sessions would go with
 *   it. It belongs in the user's home directory.
 */

export interface Bundle {
  readonly dashboardDir: string;
  readonly migrationsFolder: string;
  /** Where a packaged install keeps its database, unless told otherwise. */
  readonly databaseFile: string;
}

/** `~/.observatory`, created on demand. */
function userDataDir(): string {
  const directory = join(homedir(), ".observatory");
  mkdirSync(directory, { recursive: true });
  return directory;
}

/**
 * The bundle this CLI ships in, or null when running from a checkout.
 *
 * Detected by looking for the assets rather than by a build-time flag: if they
 * are beside the entry point, this is a packaged install. A flag would be one
 * more thing that can be wrong.
 */
export function resolveBundle(): Bundle | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const dashboardDir = join(here, "dashboard");
  const migrationsFolder = join(here, "migrations");

  if (!existsSync(dashboardDir) || !existsSync(migrationsFolder)) return null;

  return {
    dashboardDir,
    migrationsFolder,
    databaseFile: join(userDataDir(), "observatory.db"),
  };
}
