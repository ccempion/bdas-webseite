import { coverflow } from "@bdas/design-system";

import type { CSSProperties } from "react";

export type Darstellung = "klassisch" | "coverflow";
export type Beschriftung = "unter" | "auf" | "keine";

const BESCHRIFTUNGEN: ReadonlySet<string> = new Set(["unter", "auf", "keine"]);

export const istBeschriftung = (wert: unknown): wert is Beschriftung =>
  typeof wert === "string" && BESCHRIFTUNGEN.has(wert);

/**
 * Which slide sits nearest the centre of the rail.
 *
 * `abstand` is the slide *pitch* — one slide's width plus the gap to the next —
 * not the width of the rail. In the flat presentation the two are the same
 * number, which is why the older tests still read the same. In Coverflow a
 * slide is narrower than the rail on purpose, so the distinction is the whole
 * point. A rail that has not been laid out yet has pitch 0, and an empty rail
 * has no slide to name.
 */
export function aktiveFolie(scrollLeft: number, abstand: number, anzahl: number): number {
  if (abstand <= 0 || anzahl <= 0) return 0;
  const index = Math.round(scrollLeft / abstand);
  return Math.min(Math.max(index, 0), anzahl - 1);
}

/**
 * Where slide `index` sits relative to the centre, in slots, as a fraction.
 *
 * Zero is dead centre, +1 is one slot to the right, -0.5 is half a slot to the
 * left. The fraction is what makes the tilt follow the finger instead of
 * snapping over the moment the active index flips.
 */
export function relativeLage(scrollLeft: number, abstand: number, index: number): number {
  if (abstand <= 0) return 0;
  return (index * abstand - scrollLeft) / abstand;
}

/**
 * The 3-D presentation of a slide at fractional distance `lage`.
 *
 * Everything interpolates over the first slot and then stops: past
 * `coverflow.maxSlots` a slide looks exactly like the one before it, so a deck
 * of twelve reads the same as a deck of three. Slides further out are off the
 * column anyway.
 *
 * Under reduced motion the tilt and the scale drop out entirely — a fade is
 * information, a spinning deck is decoration.
 */
export function coverflowStil(lage: number, reduziert: boolean): CSSProperties {
  const gekappt = Math.max(Math.min(lage, coverflow.maxSlots), -coverflow.maxSlots);
  const betrag = Math.min(Math.abs(gekappt), 1);
  const deckkraft = 1 - betrag * (1 - coverflow.opacity);
  const zIndex = Math.round((coverflow.maxSlots - Math.abs(gekappt)) * 100);

  if (reduziert) return { opacity: deckkraft, zIndex };

  const winkel = -gekappt * coverflow.tiltDeg;
  const groesse = 1 - betrag * (1 - coverflow.scale);
  return {
    opacity: deckkraft,
    zIndex,
    transform: `rotateY(${Number(winkel.toFixed(2))}deg) scale(${Number(groesse.toFixed(4))})`,
  };
}

/**
 * The presentation actually rendered, which is not always the one chosen.
 *
 * Two overrides, both deliberate (ADR 0041): below three slides there is no
 * middle for the neighbours to flank, and inside the Puck editor a `transform`
 * moves a block's painted box away from its layout box, which is what drag and
 * drop hit-tests against.
 */
export function effektiveDarstellung(
  darstellung: Darstellung | undefined,
  anzahl: number,
  imEditor: boolean,
): Darstellung {
  if (darstellung !== "coverflow") return "klassisch";
  if (imEditor || anzahl < 3) return "klassisch";
  return "coverflow";
}
