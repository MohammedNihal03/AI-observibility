/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16 writes AGENTS.md / CLAUDE.md into this workspace on first run.
  // Repository documentation is authored deliberately, not generated.
  agentRules: false,

  /*
   * A static export, because the dashboard genuinely is static.
   *
   * Every byte of data arrives from the local API in the browser - there is no
   * server-side fetch anywhere in this app - so there is nothing for a Node
   * server to do at runtime. Exporting to plain files means the packaged CLI
   * can serve the dashboard from the same process and the same port as the API,
   * instead of shipping a second server and asking a user to run two commands.
   */
  output: "export",

  images: {
    // Export has no image optimizer to call. These are four local PNGs.
    unoptimized: true,
  },

  // Workspace packages are consumed as built JS from `dist`, but transpiling
  // them keeps `next dev` working when a package is edited mid-session.
  transpilePackages: ["@observatory/shared"],

  env: {
    /*
     * Where the dashboard looks for the API (BUILD.md section 7: the local
     * server, and nothing else).
     *
     * Empty means "same origin", which is what the packaged build uses - the
     * API serves the dashboard, so a relative `/api/...` is correct and needs
     * no configuration. In development the two run on separate ports, so the
     * default is the absolute address of the API.
     */
    NEXT_PUBLIC_OBSERVATORY_API: process.env.NEXT_PUBLIC_OBSERVATORY_API ?? "http://127.0.0.1:4000",
  },
};

export default nextConfig;
