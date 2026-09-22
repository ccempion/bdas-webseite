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

/** Zweiter Server mit eingeschaltetem Onboarding-Wizard. Die übrigen Specs
 *  laufen weiter ohne das Flag, bis der alte Registrierungsweg entfernt ist. */
const ONBOARDING_PORT = 3001;
const onboardingURL = `http://localhost:${ONBOARDING_PORT}`;
const ONBOARDING_SPECS = /onboarding-.*\.e2e\.ts$/;

const APP_ENV = {
  BDAS_FLAG_AUTH: "true",
  BDAS_FLAG_MEMBERS: "true",
  BDAS_FLAG_GROUPS: "true",
  BDAS_FLAG_DASHBOARD: "true",
  BDAS_FLAG_PUBLIC_SHELL: "true",
  BDAS_FLAG_CONTENT: "true",
  BDAS_FLAG_BLOG: "true",
  BDAS_FLAG_BLOG_COMMENTS: "true",
  BDAS_FLAG_PROFILE: "true",
  BDAS_FLAG_FAQ: "true",
  BDAS_FLAG_FAQ_SUITE: "true",
  BDAS_FLAG_NEWSLETTER: "true",
  BDAS_FLAG_NOTIFICATIONS: "true",
  BDAS_FLAG_ACCOUNT_DELETION: "true",
  E2E_EMAIL_CAPTURE: "true",
};

const dismissedNotice = (origin: string) => ({
  cookies: [],
  origins: [{ origin, localStorage: [{ name: "bdas-cookie-notice", value: "dismissed" }] }],
});

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  // Clears groups left by earlier runs; without it a reused local database
  // accumulates duplicates that break specs which never seeded anything.
  globalSetup: "./e2e/global-setup.ts",
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
    // Start every spec as a visitor who has already read the cookie notice.
    // The notice is `fixed bottom-0` and ~135px tall on this viewport, so an
    // undismissed one silently covers whatever control happens to land in that
    // strip — Playwright considers such an element visible and never scrolls
    // it clear, so the click retries until the test times out. The specs that
    // exercise the notice itself opt back out via `test.use`.
    storageState: dismissedNotice(baseURL),
  },
  projects: [
    {
      name: "mobile-chromium",
      // §23 asks for mobile; use a mobile viewport/UA.
      use: { ...devices["Pixel 7"] },
      testIgnore: ONBOARDING_SPECS,
    },
    {
      name: "onboarding",
      use: {
        ...devices["Pixel 7"],
        baseURL: onboardingURL,
        storageState: dismissedNotice(onboardingURL),
      },
      testMatch: ONBOARDING_SPECS,
    },
  ],
  // Start the production server unless one is already running (local reuse).
  webServer: [
    {
      command: "pnpm --filter @bdas/web start",
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: !process.env["CI"],
      env: APP_ENV,
    },
    {
      command: `pnpm --filter @bdas/web exec next start -p ${ONBOARDING_PORT}`,
      url: onboardingURL,
      timeout: 120_000,
      reuseExistingServer: !process.env["CI"],
      env: {
        ...APP_ENV,
        BDAS_FLAG_ONBOARDING: "true",
        BDAS_FLAG_EVENTS: "true",
        PUBLIC_SITE_URL: onboardingURL,
      },
    },
  ],
});
