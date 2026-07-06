import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are TS source — let Next compile them via SWC.
  transpilePackages: [
    "@bdas/design-system",
    "@bdas/feature-flags",
    "@bdas/files",
    "@bdas/errors",
    "@bdas/auth",
    "@bdas/content-bridge",
    "@bdas/db",
    "@bdas/events",
    "@bdas/groups",
    "@bdas/id",
    "@bdas/members",
    "@bdas/notifications",
    "@bdas/storage",
  ],
  experimental: {
    instrumentationHook: true,
    typedRoutes: true,
    serverComponentsExternalPackages: ["@node-rs/argon2"],
    // Trace from the monorepo root so hoisted deps get included
    // in the deployed function bundle (pnpm + Vercel monorepo support).
    outputFileTracingRoot: monorepoRoot,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(config.externals ?? []),
        { "@node-rs/argon2": "commonjs @node-rs/argon2" },
      ];
    }
    return config;
  },
  // Legacy WordPress paths (pre-2026 bdas.de). Seed list — extend from the
  // WordPress export before DNS cutover (spec §1 "Legacy URL redirects").
  async redirects() {
    return [
      { source: "/news", destination: "/", permanent: true },
      { source: "/news/:slug", destination: "/", permanent: true },
      {
        source: "/ueber-uns/:slug((?!verbandsstruktur|bdaj).*)",
        destination: "/ueber-uns",
        permanent: true,
      },
      { source: "/kontakt", destination: "/", permanent: true },
      { source: "/mitmachen", destination: "/registrieren", permanent: true },
    ];
  },
};

export default nextConfig;
