import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["core/**/src/**", "modules/**/src/**", "infra/**/src/**"],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "**/dist/**"],
    },
  },
});
