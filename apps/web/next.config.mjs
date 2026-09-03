/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16 writes AGENTS.md / CLAUDE.md into this workspace on first run.
  // Repository documentation is authored deliberately, not generated.
  agentRules: false,
  // Workspace packages are consumed as built JS from `dist`, but transpiling
  // them keeps `next dev` working when a package is edited mid-session.
  transpilePackages: [
    "@observatory/shared",
    "@observatory/telemetry",
    "@observatory/metrics",
    "@observatory/behavior",
    "@observatory/collectors",
  ],
  env: {
    // The dashboard talks to the local server only (BUILD.md section 7).
    NEXT_PUBLIC_OBSERVATORY_API: process.env.NEXT_PUBLIC_OBSERVATORY_API ?? "http://127.0.0.1:4000",
  },
};

export default nextConfig;
