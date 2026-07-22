"use client";

import { forwardRef, useState } from "react";

import { cx } from "../cx";
import { Input, type InputProps } from "./Input";

/**
 * Password field with a click-to-reveal toggle. Wraps {@link Input} and owns
 * the `type` attribute (password ↔ text); every other Input prop is forwarded.
 * The field is uncontrolled, so flipping `type` reveals the already-typed value
 * without losing it. Default state is hidden.
 */
export type PasswordInputProps = Omit<InputProps, "type">;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, disabled, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          disabled={disabled}
          className={cx("pr-11", className)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
          className={cx(
            "absolute inset-y-0 right-0 flex items-center rounded-bdas-sm px-3",
            "text-bdas-ink-muted transition-colors duration-bdas-quick ease-bdas",
            "hover:text-bdas-ink focus-visible:text-bdas-ink",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-red/20",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    );
  },
);

/** Open eye — shown while the password is hidden ("click to reveal"). */
function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Struck-through eye — shown while the password is visible ("click to hide"). */
function EyeOffIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.1 6.1C3.6 7.6 2 12 2 12s3.5 7 10 7a9.12 9.12 0 0 0 4.06-.94" />
      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
