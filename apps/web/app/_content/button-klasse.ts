/**
 * The one button class scale in the Puck palette.
 *
 * Its own leaf module because two blocks render a link styled as a button —
 * the `Button` block, inline in `puck-config.tsx`, and `Hero.tsx`, which
 * `puck-config.tsx` imports. Same cycle-avoidance reasoning as `bild-breite.ts`.
 */
export type ButtonVariante = "primaer" | "sekundaer" | "hell";

const BUTTON_KLASSE: Record<ButtonVariante, string> = {
  primaer:
    "inline-flex items-center rounded-bdas-sm bg-bdas-red px-4 py-2 text-sm font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:opacity-90",
  sekundaer:
    "inline-flex items-center rounded-bdas-sm border border-bdas-strong px-4 py-2 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover",
  // Only ever reached from `Hero`, where the ground is the brand red or a
  // scrimmed photo: `primaer` would be red on red and `sekundaer`'s hairline
  // outline has no contrast on either. Not offered in the `Button` block's
  // select — the Hero derives it from its own background. Composed from
  // existing tokens only; no new raw values.
  hell: "inline-flex items-center rounded-bdas-sm bg-bdas-surface px-4 py-2 text-sm font-medium text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover",
};

/** Total over `undefined` and over unrecognised values: a document saved
 *  before the field existed carries no `variante`, and the old default was
 *  the primary button. */
export const buttonKlasse = (v: ButtonVariante | undefined): string =>
  v !== undefined && Object.hasOwn(BUTTON_KLASSE, v) ? BUTTON_KLASSE[v] : BUTTON_KLASSE.primaer;
