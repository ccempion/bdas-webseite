import type { HTMLAttributes } from "react";

import { cx } from "../cx.js";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** When true, applies the pronounced hero-card hover (-5px, big shadow). */
  hero?: boolean;
  /** Disables the lift-on-hover effect. */
  flat?: boolean;
};

const BASE =
  "rounded-bdas bg-bdas-surface border border-bdas-soft " +
  "transition duration-bdas-soft ease-bdas";

const RESTING = "shadow-bdas-card";
const RESTING_HERO = "shadow-bdas-card-low";

const HOVER = "hover:shadow-bdas-lift-sm hover:-translate-y-0.5";
const HOVER_HERO = "hover:shadow-bdas-lift-lg hover:-translate-y-1";

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
