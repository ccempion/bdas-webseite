"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@bdas/design-system";

export type PhotoLightboxProps = {
  /** Signed URL or local object URL. The lightbox is never opened without one. */
  src: string;
  busy: boolean;
  onChange: () => void;
  onRemove: () => void;
  onClose: () => void;
};

/**
 * The enlarged profile photo, with the two things you can do to it.
 *
 * Presentational only: it knows nothing about uploading, cropping or storage —
 * the caller owns that and passes `busy` down so both buttons lock during a
 * round trip. Native `<dialog>` + `showModal()`, same idiom as CropDialog, so
 * Esc and the focus trap come from the platform rather than from us.
 *
 * The stored photo is a square (CropDialog's OUTPUT_SIZE), so it is shown
 * as a rounded square rather than re-cropped to a circle — enlarging exists to
 * reveal the whole image, and a second circular mask would hide the corners the
 * member framed.
 */
export function PhotoLightbox({ src, busy, onChange, onRemove, onClose }: PhotoLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // The backdrop is painted by the dialog box itself, so a click that lands
      // on the element rather than on its contents is a click outside.
      onClick={(e) => {
        if (e.target === dialogRef.current && !busy) onClose();
      }}
      className="rounded-bdas border border-bdas-strong bg-bdas-surface p-6 shadow-bdas-dropdown backdrop:bg-black/80"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between gap-6">
          <h2 className="text-lg font-semibold text-bdas-ink">Profilbild</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
            aria-label="Schließen"
          >
            ✕
          </Button>
        </div>

        <img
          src={src}
          alt="Profilbild in voller Größe"
          className="rounded-bdas border border-bdas-soft bg-bdas-overlay-soft object-contain"
          // 75vh rather than 90 leaves room for the heading and buttons, so the
          // card never outgrows a short laptop viewport.
          style={{ maxWidth: "min(90vw, 1024px)", maxHeight: "min(75vh, 1024px)" }}
        />

        {confirmingRemove ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-bdas-ink-body">Profilbild wirklich entfernen?</p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setConfirmingRemove(false)}
                disabled={busy}
              >
                Abbrechen
              </Button>
              <Button onClick={onRemove} disabled={busy}>
                {busy ? "Wird entfernt…" : "Entfernen"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button onClick={onChange} disabled={busy}>
              Bild ändern
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingRemove(true)} disabled={busy}>
              Bild entfernen
            </Button>
          </div>
        )}
      </div>
    </dialog>
  );
}
