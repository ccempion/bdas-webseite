/**
 * Tailwind preset shared across the platform's apps. Tokens come from
 * ./tokens.ts — never inline values here.
 *
 * The local TailwindPreset type avoids depending on tailwindcss until
 * Sprint 1 installs it; apps will retype this against `Config['theme']`.
 */
import { colors, keyframes, motion, radii, shadows, typography } from "./tokens";

type TailwindPreset = {
  theme?: {
    extend?: Record<string, unknown>;
  };
};

export const tailwindPreset: TailwindPreset = {
  theme: {
    extend: {
      colors: {
        bdas: {
          red: colors.brand.red,
          ink: colors.ink.strong,
          "ink-body": colors.ink.body,
          "ink-muted": colors.ink.muted,
          surface: colors.surface.base,
          "surface-hover": colors.surface.hover,
        },
      },
      borderRadius: {
        bdas: radii.md,
        "bdas-sm": radii.sm,
        "bdas-pill": radii.pill,
      },
      borderColor: {
        "bdas-soft": colors.border.soft,
        "bdas-strong": colors.border.strong,
      },
      backgroundColor: {
        "bdas-overlay-faint": colors.surface.overlay.faint,
        "bdas-overlay-hover": colors.surface.overlay.hover,
        "bdas-overlay-soft": colors.surface.overlay.soft,
      },
      boxShadow: {
        "bdas-card": shadows.cardResting,
        "bdas-card-low": shadows.cardLow,
        "bdas-lift-sm": shadows.cardLiftSm,
        "bdas-lift-lg": shadows.cardLiftLg,
        "bdas-dropdown": shadows.dropdown,
        "bdas-red-glow": shadows.redGlow,
      },
      transitionDuration: {
        "bdas-quick": "200",
        "bdas-soft": "300",
        "bdas-slow": "400",
      },
      transitionTimingFunction: {
        bdas: motion.easing,
      },
      translate: {
        "bdas-lift-sm": motion.lift.sm,
        "bdas-lift-md": motion.lift.md,
      },
      fontSize: {
        "bdas-summary": typography.size.summary,
        "bdas-body": typography.size.body,
        "bdas-pill": typography.size.pill,
        "bdas-dropdown-link": typography.size.dropdownLink,
        "bdas-submenu-link": typography.size.submenuLink,
        "bdas-icon": typography.size.icon,
      },
      backgroundImage: {
        "bdas-hero-scrim": colors.surface.overlay.heroScrim,
      },
      keyframes: {
        "bdas-fade-slide-down": keyframes.fadeSlideDown,
        "bdas-loader-sweep": keyframes.loaderSweep,
        "bdas-loader-cap": keyframes.loaderCap,
      },
      animation: {
        "bdas-fade-slide-down": "bdas-fade-slide-down 400ms ease forwards",
        "bdas-loader-sweep": `bdas-loader-sweep ${motion.durationLoop} ease infinite`,
        "bdas-loader-cap": `bdas-loader-cap ${motion.durationLoop} ease infinite`,
      },
    },
  },
};
