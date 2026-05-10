/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are TS source — let Next compile them via SWC.
  transpilePackages: [
    "@bdas/design-system",
    "@bdas/feature-flags",
    "@bdas/errors",
    "@bdas/auth",
    "@bdas/content-bridge",
    "@bdas/db",
    "@bdas/events",
    "@bdas/groups",
    "@bdas/id",
    "@bdas/members",
  ],
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ["@node-rs/argon2"],
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
};

export default nextConfig;
