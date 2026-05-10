import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

import { cx } from "../cx.js";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

const BASE =
  "block w-full rounded-bdas bg-bdas-surface border border-bdas-soft " +
  "text-bdas-ink placeholder:text-bdas-ink-muted " +
  "px-3 py-2.5 text-base " +
  "transition-colors duration-bdas-quick ease-bdas " +
  "focus:outline-none focus:border-bdas-red focus:ring-2 focus:ring-bdas-red/20 " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

const INVALID = "border-bdas-red focus:ring-bdas-red/30";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(BASE, invalid && INVALID, className)}
      {...rest}
    />
  );
});
