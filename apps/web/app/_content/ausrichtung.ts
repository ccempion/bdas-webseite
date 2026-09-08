/**
 * Per-block horizontal alignment (ADR 0023 palette). `links` is the default
 * and is what every block rendered before the control existed.
 *
 * Its own leaf module for the same reason as `bild-breite.ts`: block
 * components that live in their own files (`Hero.tsx`, and the grid blocks in
 * PR3) need these helpers, and `puck-config.tsx` imports those files — so the
 * shared lookup cannot live in `puck-config.tsx` without a cycle.
 * `puck-config.tsx` re-exports all three, so existing importers are unaffected.
 */
export type Ausrichtung = "links" | "mittig" | "rechts";

const AUSRICHTUNG_TEXT: Record<Ausrichtung, string> = {
  links: "text-left",
  mittig: "text-center",
  rechts: "text-right",
};

const AUSRICHTUNG_FLEX: Record<Ausrichtung, string> = {
  links: "justify-start",
  mittig: "justify-center",
  rechts: "justify-end",
};

/** Both lookups fall back to the `links` classes for a missing or unrecognised
 *  value: documents saved before this field existed carry no `ausrichtung`,
 *  and they must keep rendering exactly as they did. Class strings are
 *  literals — Tailwind's scanner never sees an interpolated class. */
export const ausrichtungText = (a: Ausrichtung | undefined): string =>
  a !== undefined && Object.hasOwn(AUSRICHTUNG_TEXT, a)
    ? AUSRICHTUNG_TEXT[a]
    : AUSRICHTUNG_TEXT.links;

export const ausrichtungFlex = (a: Ausrichtung | undefined): string =>
  a !== undefined && Object.hasOwn(AUSRICHTUNG_FLEX, a)
    ? AUSRICHTUNG_FLEX[a]
    : AUSRICHTUNG_FLEX.links;
