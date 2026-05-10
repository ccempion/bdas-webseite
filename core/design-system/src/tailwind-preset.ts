/**
 * Tailwind preset shared by apps/web, apps/dashboard, and the WordPress theme.
 * Sprint 1 will fill in the full token set (colors, typography, spacing).
 *
 * The local TailwindPreset type avoids depending on tailwindcss until
 * the apps that consume it are scaffolded in Sprint 1.
 */

type TailwindPreset = {
  theme?: {
    extend?: Record<string, unknown>;
  };
};

export const tailwindPreset: TailwindPreset = {
  theme: {
    extend: {
      // Tokens land in Sprint 1.
    },
  },
};
