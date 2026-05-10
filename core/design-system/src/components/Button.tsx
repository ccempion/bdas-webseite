import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

import { cx } from "../cx.js";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-bdas-red text-white hover:brightness-110 focus-visible:ring-2 focus-visible:ring-bdas-red/40",
  secondary:
    "bg-bdas-surface text-bdas-ink border border-bdas-soft hover:bg-bdas-overlay-hover focus-visible:ring-2 focus-visible:ring-bdas-soft",
  ghost:
    "bg-transparent text-bdas-ink hover:bg-bdas-overlay-hover focus-visible:ring-2 focus-visible:ring-bdas-soft",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "text-sm py-1.5 px-3",
  md: "text-base py-2.5 px-4",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-bdas font-medium " +
  "transition-colors duration-bdas-quick ease-bdas " +
  "focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(BASE, VARIANT[variant], SIZE[size], className)}
      {...rest}
    />
  );
});
