/**
 * The one image-width scale in this codebase.
 *
 * Four steps, matching the presets the blog and events rich-text editors
 * already offer (`_blog/PostEditor.tsx:36`, `admin/events/_editor/RichTextEditor.tsx:32`),
 * so a page never mixes two different scales. Consumed by the `Bild` block and
 * — per `2026-08-10-fliesstext-bilder-umfliessen-design.md` — by the inline
 * images in `rich-text.tsx`. It lives in its own leaf module because
 * `puck-config.tsx` imports `rich-text.tsx`; the shared lookup cannot live in
 * either without creating a cycle.
 */
export type BildBreite = 25 | 50 | 75 | 100;

export const BILD_BREITE_STUFEN: readonly BildBreite[] = [25, 50, 75, 100];

/** Literal class strings — Tailwind's scanner never sees an interpolated class.
 *  Every step is `w-full` below `sm`: a 25 % image on a 380px phone is a
 *  thumbnail, and `breite: "halb"` was already full width there (`sm:max-w-md`). */
const BILD_BREITE_CLASS: Record<BildBreite, string> = {
  25: "w-full sm:w-1/4",
  50: "w-full sm:w-1/2",
  75: "w-full sm:w-3/4",
  100: "w-full",
};

/** Total over `undefined` and over unrecognised values: the structural sweep in
 *  `puck-config.test.ts` renders every block with a prop bag carrying no
 *  `breite`, and an unmigrated legacy document carries a string. */
export const bildBreiteClass = (breite: BildBreite | undefined): string =>
  breite !== undefined && Object.hasOwn(BILD_BREITE_CLASS, breite)
    ? BILD_BREITE_CLASS[breite]
    : BILD_BREITE_CLASS[100];

/** Migrate a stored `Bild.breite` onto the numeric scale. Documents written
 *  before this change carry `"voll"` or `"halb"`. Anything else — including a
 *  numeric string from a hand-edited document — becomes full width, which is
 *  the safe direction: an image is never silently shrunk. */
export function normalizeBildBreite(value: unknown): BildBreite {
  if (value === 25 || value === 50 || value === 75 || value === 100) return value;
  if (value === "halb") return 50;
  return 100;
}

/** Snap a drag to the nearest step. `anteil` is a fraction of the container
 *  width, so it is naturally clamped by picking the nearest of four values.
 *  Ties resolve downwards (strict `<`), which keeps a drag parked exactly on a
 *  midpoint from flickering between two steps. */
export function snapBildBreite(anteil: number): BildBreite {
  if (!Number.isFinite(anteil)) return 100;
  const prozent = anteil * 100;
  return BILD_BREITE_STUFEN.reduce((beste, stufe) =>
    Math.abs(stufe - prozent) < Math.abs(beste - prozent) ? stufe : beste,
  );
}
