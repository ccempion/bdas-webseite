import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../cx.js";

export type AlertVariant = "error" | "info" | "success";

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
  title?: ReactNode;
};

const BASE =
  "rounded-bdas bg-bdas-surface border border-bdas-soft " + "px-5 py-4 text-bdas-ink-body";

const VARIANT: Record<AlertVariant, string> = {
  // Mirrors the accordion[open] idiom: red left border + red glow halo.
  error: "border-l-4 border-l-bdas-red shadow-bdas-red-glow text-bdas-ink",
  info: "shadow-bdas-card",
  success: "shadow-bdas-card",
};

export function Alert({ variant = "info", title, className, children, ...rest }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cx(BASE, VARIANT[variant], className)}
      {...rest}
    >
      {title ? <p className="font-semibold mb-1">{title}</p> : null}
      <div className="text-bdas-body leading-relaxed">{children}</div>
    </div>
  );
}
