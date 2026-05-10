/**
 * Default Drizzle Kit config.
 *
 * Per CLAUDE.md §3, each module owns its migrations under modules/<name>/migrations/.
 * Per-module configs live alongside the module's schema. This file is a fallback
 * for ad-hoc tooling (e.g., `drizzle-kit studio`) and points at all module schemas
 * for browsing convenience only — never use it to generate migrations.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./modules/*/src/schema.ts"],
  out: "./.drizzle-noop",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://bdas:bdas@localhost:5432/bdas",
  },
  verbose: true,
});
