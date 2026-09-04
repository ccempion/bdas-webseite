import { useEffect, useId, useRef, type ReactNode } from "react";

import { cx } from "../cx";

export type DialogProps = {
  open: boolean;
  /** Fires on Esc (native `cancel`), backdrop click, or the close button. */
  onClose: () => void;
  /** Visible title, wired to `aria-labelledby`. */
  title: string;
  children: ReactNode;
  /** `max-w-lg` (default) | `max-w-2xl` (editor forms, PR 3). */
  wide?: boolean;
};

/**
 * Modal dialog on the native `<dialog>` element — `showModal()` gives us
 * focus trapping and Esc-to-close for free. Renders `null` while closed
 * rather than leaving a closed `<dialog>` in the DOM.
 *
 * Confirming unsaved changes before close is the calling form's job (PR 3),
 * not this primitive's.
 */
export function Dialog({ open, onClose, title, children, wide }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Native Esc handling — prevent the default close so React stays in
        // sync via `onClose`/`open`, rather than the element closing itself.
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Backdrop click only — a click landing on the dialog's own content
        // targets a descendant, not the `<dialog>` element itself.
        if (e.target === dialogRef.current) onClose();
      }}
      className={cx(
        "rounded-bdas bg-bdas-surface p-6 shadow-bdas-dropdown backdrop:bg-black/50",
        "motion-safe:animate-bdas-fade-slide-down",
        wide ? "max-w-2xl" : "max-w-lg",
        "w-full",
      )}
    >
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute right-4 top-4 text-bdas-ink-muted transition-colors duration-bdas-quick ease-bdas hover:text-bdas-ink"
      >
        ×
      </button>
      <h2 id={titleId} className="text-bdas-ink font-semibold mb-4 pr-8">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
