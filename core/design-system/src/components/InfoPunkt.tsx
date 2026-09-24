"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cx } from "../cx";

export type InfoPunktProps = {
  /** The word being explained, shown bold in the bubble and in the button's name. */
  begriff: string;
  /** The explanation. */
  children: ReactNode;
  /** Optional "Mehr dazu" target. */
  mehrHref?: string | null;
  /** Fires once per opening, e.g. to fetch `mehrHref` lazily. */
  onOpen?: () => void;
};

// One bubble open at a time across the page: opening one announces its id,
// every other instance closes on hearing it.
const OPEN_EVENT = "bdas:infopunkt-open";
/** Matches the page's 16px side gutter. */
const VIEWPORT_MARGIN = 16;

/**
 * A small "?" after a term that opens a short explanation on click or tap —
 * never on hover, which phones don't have. Non-modal: focus stays where it
 * is and Tab moves on normally. Closes on a second click, Escape, a click
 * outside, or when another InfoPunkt opens.
 */
export function InfoPunkt({ begriff, children, mehrHref, onOpen }: InfoPunktProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const bubbleId = `${id}-info`;
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  // A term near the right edge would push the bubble off-screen on a phone;
  // pull it back left by exactly the overflow.
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const rect = bubbleRef.current?.getBoundingClientRect();
    if (!rect) return;
    const overflow = rect.right - (window.innerWidth - VIEWPORT_MARGIN);
    setShift(overflow > 0 ? Math.max(0, Math.min(overflow, rect.left - VIEWPORT_MARGIN)) : 0);
  }, [open]);

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) setOpen(false);
    };
    document.addEventListener(OPEN_EVENT, onOther);
    return () => document.removeEventListener(OPEN_EVENT, onOther);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    setOpen(true);
    onOpen?.();
  }

  return (
    <span ref={rootRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={bubbleId}
        aria-label={`Was bedeutet „${begriff}“?`}
        onClick={toggle}
        className={cx(
          "ml-1 inline-flex h-[1.1em] w-[1.1em] translate-y-[-0.1em] items-center justify-center rounded-bdas-full border align-middle text-[0.7em] font-bold leading-none transition-colors duration-bdas-quick ease-bdas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          open
            ? "border-bdas-strong bg-bdas-red text-white"
            : "border-bdas-soft text-bdas-ink-muted hover:border-bdas-strong hover:text-bdas-red",
        )}
      >
        ?
      </button>
      {open && (
        <span
          ref={bubbleRef}
          id={bubbleId}
          style={shift ? { marginLeft: -shift } : undefined}
          role="note"
          className="absolute left-0 top-full z-bdas-header mt-2 block w-[min(18rem,calc(100vw-2rem))] animate-bdas-fade-slide-down rounded-bdas border border-bdas-soft bg-bdas-surface p-3 whitespace-normal text-left text-sm font-normal normal-case leading-snug tracking-normal text-bdas-ink-body shadow-bdas-dropdown"
        >
          <strong className="block font-bold text-bdas-ink">{begriff}</strong>
          <span className="mt-1 block">{children}</span>
          {mehrHref && (
            <a
              href={mehrHref}
              className="mt-2 inline-block font-semibold text-bdas-red transition-colors duration-bdas-quick ease-bdas hover:underline"
            >
              Mehr dazu →
            </a>
          )}
        </span>
      )}
    </span>
  );
}
