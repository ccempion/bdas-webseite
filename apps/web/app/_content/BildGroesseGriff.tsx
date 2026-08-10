"use client";

import { registerOverlayPortal, usePuck } from "@puckeditor/core";
import { useEffect, useRef, useState } from "react";

import { type BildBreite, snapBildBreite } from "./bild-breite";

/**
 * In-canvas resize handle for the `Bild` block. Mounted only under
 * `puck.isEditing`, so the public page never ships it.
 *
 * Puck has no resize field — the shipped `.d.ts` of 0.22.2 and 0.23.0 both
 * offer `array · custom · external · number · object · radio · richtext ·
 * select · slot · text · textarea` and nothing dimensional — so this is
 * hand-rolled, but on first-party APIs: `registerOverlayPortal` marks the
 * handle interactive so dnd-kit does not turn the gesture into a block drag,
 * and `usePuck().dispatch` writes the new value, which is the combination the
 * overlay-portals documentation names for inline inputs.
 *
 * The sidebar keeps an equivalent select — a drag-only control is unusable by
 * keyboard.
 */
export function BildGroesseGriff({ id, breite }: { id: string; breite: BildBreite }) {
  const { dispatch, getItemById, getSelectorForId, selectedItem } = usePuck();
  const griffRef = useRef<HTMLDivElement>(null);
  const zug = useRef<{ startX: number; startBreite: BildBreite; containerBreite: number } | null>(
    null,
  );
  const [aktuell, setAktuell] = useState<BildBreite | null>(null);

  // Handles belong to the selected block only — standard editor behaviour, and
  // it keeps a page of images from sprouting handles everywhere.
  const istAusgewaehlt = selectedItem?.props.id === id;

  // Keyed on selection, not `[]`: the handle is absent from the DOM until this
  // block is selected, so on the first run of an empty-dependency effect the
  // ref is still null and the portal would never be registered.
  useEffect(() => {
    if (!istAusgewaehlt) return;
    return registerOverlayPortal(griffRef.current, { disableDrag: true });
  }, [istAusgewaehlt]);

  if (!istAusgewaehlt) return null;

  function schreibe(neu: BildBreite, recordHistory: boolean) {
    const selector = getSelectorForId(id);
    const item = getItemById(id);
    if (!selector || !item) return;
    dispatch({
      type: "replace",
      recordHistory,
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...item, props: { ...item.props, breite: neu } },
    });
  }

  return (
    <div
      ref={griffRef}
      data-bild-groesse-griff
      aria-hidden
      className="absolute right-0 top-1/2 flex h-10 w-3 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-bdas-sm border border-bdas-strong bg-bdas-surface"
      onPointerDown={(e) => {
        const container = griffRef.current?.closest("[data-bild-rahmen]");
        const rect = container?.getBoundingClientRect();
        if (!rect) return;
        zug.current = { startX: e.clientX, startBreite: breite, containerBreite: rect.width };
        setAktuell(breite);
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const z = zug.current;
        if (!z) return;
        const anteil = z.startBreite / 100 + (e.clientX - z.startX) / z.containerBreite;
        const neu = snapBildBreite(anteil);
        if (neu === aktuell) return;
        setAktuell(neu);
        // Live resize, but no undo entry per step — the release records one.
        schreibe(neu, false);
      }}
      onPointerUp={(e) => {
        const z = zug.current;
        zug.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (z && aktuell !== null && aktuell !== z.startBreite) schreibe(aktuell, true);
        setAktuell(null);
      }}
    >
      {aktuell === null ? null : (
        <span className="pointer-events-none absolute right-5 rounded-bdas-sm border border-bdas-strong bg-bdas-surface px-2 py-1 text-xs text-bdas-ink-muted">
          {aktuell} %
        </span>
      )}
    </div>
  );
}
