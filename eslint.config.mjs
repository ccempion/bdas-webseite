// @ts-check
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import boundaries from "eslint-plugin-boundaries";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/*.config.{js,mjs,cjs}",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    plugins: {
      import: importPlugin,
      boundaries,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    settings: {
      "boundaries/elements": [
        { type: "core", pattern: "core/*", mode: "folder" },
        { type: "module", pattern: "modules/*", mode: "folder" },
        { type: "app", pattern: "apps/*", mode: "folder" },
        { type: "infra", pattern: "infra/*", mode: "folder" },
      ],
      "boundaries/include": ["core/**/*", "modules/**/*", "apps/**/*", "infra/**/*"],
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      // Belt-and-suspenders: package.json `exports` already block deep imports,
      // this catches the same violation with a clearer error message.
      "import/no-internal-modules": ["error", { forbid: ["@bdas/*/src/**", "@bdas/*/dist/**"] }],
      // Enforces the §5 layering rules from CLAUDE.md.
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: ["core"], allow: ["core"] },
            { from: ["module"], allow: ["core", "module"] },
            { from: ["app"], allow: ["core", "module", "infra"] },
            { from: ["infra"], allow: ["core", "module"] },
          ],
        },
      ],
    },
  },
  // Tests can reach into anywhere — boundary rules only apply to production code.
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/test/**", "**/tests/**"],
    rules: {
      "boundaries/element-types": "off",
      "import/no-internal-modules": "off",
    },
  },
);
