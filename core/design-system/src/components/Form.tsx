import type { FormHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

import { cx } from "../cx";

export function Form({ className, ...rest }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cx("flex flex-col gap-5", className)} {...rest} />;
}

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, ...rest }: LabelProps) {
  return <label className={cx("text-sm font-medium text-bdas-ink", className)} {...rest} />;
}

export type FieldProps = {
  /** Visible label text. */
  label: ReactNode;
  /** id attribute used to wire <label> ↔ control. */
  htmlFor: string;
  /** Optional non-error hint shown below the control. */
  hint?: ReactNode;
  /** Error message; presence implies invalid state. */
  error?: ReactNode;
  /** The form control (Input, Select, etc.). */
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5" data-field={htmlFor}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div data-described-by={describedBy}>{children}</div>
      {hint && !error ? (
        <p id={hintId} className="text-sm text-bdas-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-bdas-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
