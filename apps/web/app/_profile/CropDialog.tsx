"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@bdas/design-system";

import { clampOffset, minZoom, sourceRect, type CropState, type Size } from "./crop";

/** Preview frame in CSS pixels. The output is always OUTPUT_SIZE, independent of this. */
const FRAME = 280;
/** Stored edge length. Large enough for the 112px avatar on a 2x display, with room to spare. */
const OUTPUT_SIZE = 512;
const NUDGE = 8;
const ZOOM_STEP = 0.1;

export type CropDialogProps = {
  file: File;
  onCancel: () => void;
  onDone: (cropped: File) => void;
};

export function CropDialog({ file, onCancel, onDone }: CropDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragFrom = useRef<{ x: number; y: number; state: CropState } | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [state, setState] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    imageRef.current = img;
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    setNatural(size);
    const zoom = minZoom(size, FRAME);
    setState(
      clampOffset(
        { zoom, x: -(size.width * zoom - FRAME) / 2, y: -(size.height * zoom - FRAME) / 2 },
        size,
        FRAME,
      ),
    );
  }

  function move(next: CropState) {
    if (!natural) return;
    setState(clampOffset(next, natural, FRAME));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragFrom.current = { x: e.clientX, y: e.clientY, state };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const from = dragFrom.current;
    if (!from) return;
    move({
      zoom: from.state.zoom,
      x: from.state.x + (e.clientX - from.x),
      y: from.state.y + (e.clientY - from.y),
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragFrom.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const byKey: Record<string, Partial<CropState>> = {
      ArrowLeft: { x: state.x - NUDGE },
      ArrowRight: { x: state.x + NUDGE },
      ArrowUp: { y: state.y - NUDGE },
      ArrowDown: { y: state.y + NUDGE },
      "+": { zoom: state.zoom + ZOOM_STEP },
      "-": { zoom: state.zoom - ZOOM_STEP },
    };
    const patch = byKey[e.key];
    if (!patch) return;
    e.preventDefault();
    move({ ...state, ...patch });
  }

  async function confirm() {
    const img = imageRef.current;
    if (!img || !natural) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      const { sx, sy, sw, sh } = sourceRect(state, natural, FRAME);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.9),
      );
      // Rather no photo than one the user did not confirm: an unclipped upload
      // here would silently ignore the crop they just made.
      if (!blob) throw new Error("toBlob returned null");

      const base = file.name.replace(/\.[^.]+$/, "");
      onDone(new File([blob], `${base}.webp`, { type: "image/webp" }));
    } catch {
      setError("Zuschneiden fehlgeschlagen. Bitte ein anderes Bild versuchen.");
    } finally {
      setBusy(false);
    }
  }

  const zoomFloor = natural ? minZoom(natural, FRAME) : 1;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="rounded-bdas border border-bdas-strong bg-bdas-surface p-6 shadow-bdas-dropdown backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-bdas-ink">Bildausschnitt wählen</h2>

        <div
          role="application"
          aria-label="Bildausschnitt verschieben: Pfeiltasten bewegen, Plus und Minus zoomen"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
          onWheel={(e) => move({ ...state, zoom: state.zoom - Math.sign(e.deltaY) * ZOOM_STEP })}
          style={{ width: FRAME, height: FRAME }}
          className="relative touch-none overflow-hidden rounded-bdas-full border border-bdas-soft bg-bdas-overlay-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bdas-red"
        >
          {url ? (
            <img
              src={url}
              alt=""
              onLoad={onImageLoad}
              draggable={false}
              style={{
                position: "absolute",
                left: state.x,
                top: state.y,
                width: natural ? natural.width * state.zoom : undefined,
                maxWidth: "none",
              }}
            />
          ) : null}
        </div>

        <label className="flex items-center gap-3 text-sm text-bdas-ink-body">
          Zoom
          <input
            type="range"
            min={zoomFloor}
            max={zoomFloor * 4}
            step={0.01}
            value={state.zoom}
            onChange={(e) => move({ ...state, zoom: Number(e.currentTarget.value) })}
            className="flex-1"
          />
        </label>

        {error ? <p className="text-sm text-bdas-red">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={busy || !natural}>
            {busy ? "Wird zugeschnitten…" : "Übernehmen"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
