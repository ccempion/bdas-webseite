import React from "react";

export type Kennzahl = {
  wert: string;
  beschriftung: string;
};

/** Literal class strings — Tailwind's scanner never sees an interpolated
 *  class. The column count is derived from how many figures there are rather
 *  than offered as a field, so the board cannot leave a lopsided row behind.
 *  Two-across below `sm` from two figures up: a figure plus a short caption is
 *  narrow enough that a single column would waste a phone screen. */
const KENNZAHLEN_GRID: Record<1 | 2 | 3 | 4, string> = {
  1: "grid gap-6",
  2: "grid grid-cols-2 gap-6",
  3: "grid grid-cols-2 gap-6 sm:grid-cols-3",
  4: "grid grid-cols-2 gap-6 sm:grid-cols-4",
};

/** Five or more figures wrap inside the four-column layout. Total over a
 *  non-finite, zero or negative count so an unexpected value can never index
 *  past the record. */
export const kennzahlenGrid = (anzahl: number): string => {
  const stufe = Number.isFinite(anzahl) ? Math.min(Math.max(Math.trunc(anzahl), 1), 4) : 1;
  return KENNZAHLEN_GRID[stufe as 1 | 2 | 3 | 4];
};

/**
 * A row of highlighted figures — "500+ Mitglieder", "seit 1994 aktiv".
 *
 * `wert` is free text on purpose: "500+" and "seit 1994" are what this block
 * is for. Plain elements rather than a `<dl>`, whose markup would demand the
 * caption precede the figure — the reverse of the reading order here.
 *
 * Purely presentational and free of Puck types — the block wrapper in
 * `puck-config.tsx` owns the editor placeholder.
 */
export function Kennzahlen({ werte }: { werte: Kennzahl[] }) {
  const liste = werte ?? [];
  return (
    <div className={kennzahlenGrid(liste.length)}>
      {liste.map((k, i) => (
        <div key={i} className="flex flex-col items-center gap-1 text-center">
          <p className="text-3xl font-semibold text-bdas-ink">{k.wert}</p>
          <p className="text-sm text-bdas-ink-muted">{k.beschriftung}</p>
        </div>
      ))}
    </div>
  );
}
