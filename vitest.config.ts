import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const pkg = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Run tests against package SOURCE, so `npm test` never depends on a prior
    // `tsc -b`. Type checking is a separate gate (`npm run typecheck`).
    alias: {
      "@observatory/shared": pkg("shared"),
      "@observatory/telemetry": pkg("telemetry"),
      "@observatory/metrics": pkg("metrics"),
      "@observatory/behavior": pkg("behavior"),
      "@observatory/collectors": pkg("collectors"),
    },
  },
  test: {
    environment: "node",
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/server/src/**/*.test.ts",
      "cli/src/**/*.test.ts",
    ],
    // Determinism matters more than speed here (BUILD.md section 57).
    sequence: { shuffle: false },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/*/src/**", "apps/server/src/**", "cli/src/**"],
      exclude: ["**/*.test.ts", "**/dist/**"],
    },
  },
});
