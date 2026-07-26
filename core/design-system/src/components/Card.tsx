import type { HTMLAttributes } from "react";

import { cx } from "../cx";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** When true, applies the pronounced hero-card hover (-5px, big shadow). */
  hero?: boolean;
  /** Disables the lift-on-hover effect. */
  flat?: boolean;
};

// `group` lets a consumer's own children (e.g. a title) react to this card's
// hover/focus state via `group-hover:`/`group-focus-visible:` — see the
// README's card recipe. A consumer wrapping the card in a focusable element
// (e.g. `<Link>`) should add `group` to that element too, so the
// `group-focus-visible:` classes below also fire on keyboard focus, not just
// mouse hover.
const BASE =
  "group rounded-bdas bg-bdas-surface border border-bdas-soft " +
  "transition duration-bdas-soft ease-bdas";

const RESTING = "shadow-bdas-card";
const RESTING_HERO = "shadow-bdas-card-low";

const HOVER =
  "hover:shadow-bdas-lift-md hover:-translate-y-bdas-lift-sm " +
  "group-focus-visible:shadow-bdas-lift-md group-focus-visible:-translate-y-bdas-lift-sm";
const HOVER_HERO =
  "hover:shadow-bdas-lift-lg hover:-translate-y-bdas-lift-md " +
  "group-focus-visible:shadow-bdas-lift-lg group-focus-visible:-translate-y-bdas-lift-md";

export function Card({ hero, flat, className, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        BASE,
        hero ? RESTING_HERO : RESTING,
        !flat && (hero ? HOVER_HERO : HOVER),
        className,
      )}
      {...rest}
    />
  );
}
