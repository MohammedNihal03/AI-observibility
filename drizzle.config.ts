import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated into `database/migrations` (the layout in BUILD.md
 * section 5) and applied at server start by `createDatabase`.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./apps/server/src/db/schema.ts",
  out: "./database/migrations",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: "./data/observatory.db",
  },
});
