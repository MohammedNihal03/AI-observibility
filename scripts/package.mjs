#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

/**
 * Builds the single publishable package.
 *
 * ## Why one package and not eight
 *
 * The repository is a workspace of eight private packages that depend on each
 * other by name. Publishing them all would mean eight npm releases to keep in
 * version lockstep, and would turn every internal module into public API that
 * cannot be changed without a major bump. None of that buys a user anything:
 * they want one command.
 *
 * So the workspace code is BUNDLED into one file and the internal package names
 * disappear. What ships is a CLI, a dashboard, and a dependency list containing
 * only genuine third-party packages.
 *
 * ## What stays external, and why
 *
 * Everything from `node_modules`. Bundling Fastify means bundling its plugin
 * resolution; bundling `better-sqlite3` is impossible because it is a native
 * binding compiled per platform. They are dependencies of the published
 * package, and npm installs them the ordinary way.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist-package");

const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const serverPackage = JSON.parse(readFileSync(join(root, "apps/server/package.json"), "utf8"));
const cliPackage = JSON.parse(readFileSync(join(root, "cli/package.json"), "utf8"));
const webPackage = JSON.parse(readFileSync(join(root, "apps/web/package.json"), "utf8"));

/** Third-party dependencies the bundle still needs at runtime. */
function runtimeDependencies() {
  const merged = { ...serverPackage.dependencies, ...cliPackage.dependencies };
  return Object.fromEntries(
    Object.entries(merged)
      .filter(([name]) => !name.startsWith("@observatory/"))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${String(result.status)}`);
  }
}

console.log("• building workspace packages");
run("npm", ["run", "build:packages"]);

console.log("• exporting the dashboard for same-origin serving");
// An empty API base makes the dashboard use relative URLs, so it works on
// whatever port the user starts the server on.
run("npm", ["run", "build", "--workspace", "@observatory/web"], {
  env: { ...process.env, NEXT_PUBLIC_OBSERVATORY_API: "" },
});

console.log("• bundling the CLI");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const external = Object.keys(runtimeDependencies());

await build({
  entryPoints: [join(root, "cli/src/index.ts")],
  outfile: join(outDir, "observatory.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external,
  banner: {
    // `better-sqlite3` and Fastify's plugin loader both reach for CommonJS
    // globals that an ESM bundle does not define.
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __dirname__ } from 'node:path';",
      "const require = __createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __dirname__(__filename);",
    ].join("\n"),
  },
  logLevel: "warning",
});

console.log("• copying the dashboard and migrations");
cpSync(join(root, "apps/web/out"), join(outDir, "dashboard"), { recursive: true });
cpSync(join(root, "database/migrations"), join(outDir, "migrations"), { recursive: true });

const manifest = {
  name: rootPackage.name,
  version: rootPackage.version,
  description: rootPackage.description,
  license: rootPackage.license,
  type: "module",
  bin: { observatory: "./observatory.mjs" },
  files: ["observatory.mjs", "dashboard", "migrations", "README.md"],
  engines: rootPackage.engines,
  dependencies: runtimeDependencies(),
  keywords: ["claude-code", "codex", "ai-agent", "observability", "telemetry", "developer-tools"],
};

writeFileSync(join(outDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
cpSync(join(root, "README.md"), join(outDir, "README.md"));

console.log(`\nPackaged ${manifest.name}@${manifest.version} into dist-package/`);
console.log(`  dependencies: ${Object.keys(manifest.dependencies).join(", ")}`);
console.log(`  dashboard:    ${webPackage.name} static export`);
// The `./` is not optional: `npm pack dist-package` treats the argument as a
// package NAME and downloads whatever stranger has published under it.
console.log("\n  npm pack ./dist-package        # make a tarball");
console.log("  npm install -g ./dist-package  # install it locally");
