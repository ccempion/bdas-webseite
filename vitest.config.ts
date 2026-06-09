import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    // `e2e/**` holds Playwright specs (`*.e2e.ts`), run by `pnpm e2e`, not vitest.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.turbo/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["core/**/src/**", "modules/**/src/**", "infra/**/src/**"],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "**/dist/**"],
    },
  },
});
