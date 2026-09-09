"use client";

export type Folie = {
  bild: string;
  titel: string;
  text: string;
};

/**
 * Which slide fills the rail right now, from the rail's own two numbers.
 *
 * Every slide is exactly one rail-width wide (`w-full shrink-0`), so this is
 * division rather than measurement — no observer, no element rectangles, and
 * therefore a pure function that a test can pin down without a layout engine.
 * `panelIsDue` in `NewsletterScrollPanel.tsx` is the same idea: the rule is
 * testable where it is written, and the DOM only supplies the numbers.
 *
 * Total over the degenerate cases: a rail that has not been laid out yet has
 * width 0, and an empty rail has no slide to name.
 */
export function aktiveFolie(scrollLeft: number, breite: number, anzahl: number): number {
  if (breite <= 0 || anzahl <= 0) return 0;
  const index = Math.round(scrollLeft / breite);
  return Math.min(Math.max(index, 0), anzahl - 1);
}
