/**
 * BDAS visual language — single source of truth.
 *
 * Distilled from the existing WordPress site CSS so the new platform is
 * visually indistinguishable from what BDAS members already know. The
 * Tailwind preset (`./tailwind-preset.ts`) consumes these; the WordPress
 * theme port in Sprint 4 will too. Do not redefine these values in apps.
 *
 * If a value is missing here, it is intentionally not part of the
 * language — propose an addition rather than ad-hoc'ing it in app code.
 */

export const colors = {
  brand: {
    /** Reserved for active/open/accent state. Never use as a default text color. */
    red: "#d12020",
    /** Soft red halo used behind opened accordions and active cards. */
    redGlow: "rgba(209, 32, 32, 0.06)",
  },
  ink: {
    /** Headings and primary body text. */
    strong: "#333333",
    /** Secondary body text inside opened cards/accordions. */
    body: "#555555",
    /** Tertiary — accordion icons, captions. */
    muted: "#888888",
  },
  surface: {
    /** Card / dropdown / pill background. */
    base: "#ffffff",
    /** Light hover fill for dropdown links and quiet menu items. */
    hover: "#f5f5f5",
    overlay: {
      /** Mobile submenu fill — barely-there grey. */
      faint: "rgba(0, 0, 0, 0.03)",
      /** Desktop nav-pill hover. */
      hover: "rgba(0, 0, 0, 0.04)",
      /** Card-on-card resting wash. */
      soft: "rgba(0, 0, 0, 0.05)",
    },
  },
  border: {
    /** Default card hairline. */
    soft: "rgba(0, 0, 0, 0.06)",
    /** Stronger hairline used on mobile pills and dropdown frames. */
    strong: "rgba(0, 0, 0, 0.1)",
  },
} as const;

export const radii = {
  /** Inner items inside a dropdown panel. */
  sm: "6px",
  /** Cards, dropdown panels, accordions, mobile pills. The default. */
  md: "12px",
  /** Desktop nav pills. */
  pill: "20px",
} as const;

export const shadows = {
  /** Card at rest — almost invisible, just enough to lift off the page. */
  cardResting: "0 2px 8px rgba(0, 0, 0, 0.02)",
  /** Card / accordion on hover — small lift companion. */
  cardLiftSm: "0 6px 16px rgba(0, 0, 0, 0.06)",
  /** Hero card hover — pronounced float. */
  cardLiftLg: "0 20px 40px rgba(0, 0, 0, 0.12)",
  /** Hero card resting — slightly more present than cardResting. */
  cardLow: "0 4px 10px rgba(0, 0, 0, 0.05)",
  /** Floating dropdown panel. */
  dropdown: "0 15px 35px rgba(0, 0, 0, 0.12)",
  /** Halo around opened accordions / active red-accent surfaces. */
  redGlow: "0 4px 15px rgba(209, 32, 32, 0.06)",
} as const;

export const motion = {
  /** Color / background transitions. */
  durationQuick: "200ms",
  /** Transform / shadow / box-shadow transitions. The default. */
  durationSoft: "300ms",
  /** Expand / fade-in transitions (accordion content). */
  durationSlow: "400ms",
  easing: "ease",
  lift: {
    /** Subtle hover lift for cards and accordions. */
    sm: "-2px",
    /** Pronounced hover lift for hero cards. */
    md: "-5px",
  },
} as const;

export const typography = {
  /**
   * Sizes that appear repeatedly in the source CSS. Sprint 1 may add a
   * full type scale on top; these are the anchors that cannot drift.
   */
  size: {
    dropdownLink: "15px",
    summary: "1.1rem",
    body: "0.95rem",
    pill: "0.9rem",
    submenuLink: "0.85rem",
    /** The "+" / "×" icon in the accordion summary. */
    icon: "1.8rem",
  },
  weight: {
    summary: "600",
    icon: "300",
  },
} as const;

/** Animations referenced by component patterns. */
export const keyframes = {
  fadeSlideDown: {
    from: { opacity: "0", transform: "translateY(-5px)" },
    to: { opacity: "1", transform: "translateY(0)" },
  },
} as const;

/**
 * Component recipes — concise English descriptions of the patterns the
 * source CSS encodes. Builders MUST honour these when introducing new
 * surfaces; deviating creates visual drift.
 */
export const recipes = {
  card: "white surface, radius md, border soft, shadow cardResting; on hover translateY lift.sm and shadow cardLiftSm",
  heroCard: "as card but resting shadow cardLow; on hover translateY lift.md and shadow cardLiftLg",
  navPill:
    "radius pill, padding 4px 12px, transparent at rest; on hover background surface.overlay.hover",
  dropdownPanel:
    "white surface, radius md, padding 8px, shadow dropdown, min-width 240px, border soft on three sides",
  accordion:
    "<details> styled as a card; on [open] add 4px left border in brand.red, shadow redGlow, summary text brand.red, '+' rotates 45deg into '×', body fades in via fadeSlideDown",
  liftHover: "transform translateY(lift.sm or lift.md), shadow upgrade, durationSoft easing",
} as const;

export type Colors = typeof colors;
export type Radii = typeof radii;
export type Shadows = typeof shadows;
export type Motion = typeof motion;
export type Typography = typeof typography;
