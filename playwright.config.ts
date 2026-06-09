import { defineConfig, devices } from "@playwright/test";

/**
 * E2E acceptance suite (§23). Drives the built `apps/web` app through the
 * user-facing happy paths — the UI / Server-Action / cookie / flag layer that
 * the per-module Postgres integration tests don't exercise.
 *
 * Specs are named `*.e2e.ts` (not `*.spec.ts`) so vitest's include pattern
 * never picks them up; vitest also excludes `e2e/**`.
 *
 * Requires a running app + a migrated Postgres (`DATABASE_URL`). Locally:
 * `pnpm db:up && pnpm db:migrate && pnpm --filter @bdas/web build` then `pnpm e2e`.
 * In CI the `e2e` job provides both (see .github/workflows/ci.yml).
 */
const PORT = 3000;
const baseURL = process.env["PUBLIC_SITE_URL"] ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  // Shared app + shared Postgres across specs → run serially for determinism.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["html", { open: "never" }], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      // §23 asks for mobile; use a mobile viewport/UA.
      use: { ...devices["Pixel 7"] },
    },
  ],
  // Start the production server unless one is already running (local reuse).
  webServer: {
    command: "pnpm --filter @bdas/web start",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env["CI"],
    env: {
      BDAS_FLAG_AUTH: "true",
      BDAS_FLAG_MEMBERS: "true",
      BDAS_FLAG_GROUPS: "true",
    },
  },
});
