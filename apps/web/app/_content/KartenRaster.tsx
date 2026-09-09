import React from "react";

import { Card } from "@bdas/design-system";

export type KartenSpalten = "2" | "3" | "4";

export type Karte = {
  bild: string;
  titel: string;
  text: string;
};

/** Literal class strings — Tailwind's scanner never sees an interpolated
 *  class. One column below `sm` on every preset: a feature card carries a
 *  title *and* a paragraph, and two of those side by side on a phone is
 *  unreadable. (`PersonenRaster` is two-across from the narrowest viewport for
 *  the opposite reason — each of its cards is a square photo.) */
const KARTEN_GRID: Record<KartenSpalten, string> = {
  "2": "grid gap-6 sm:grid-cols-2",
  "3": "grid gap-6 sm:grid-cols-2 lg:grid-cols-3",
  "4": "grid gap-6 sm:grid-cols-2 lg:grid-cols-4",
};

/** Total over `undefined` and over unrecognised values: a document saved
 *  before the field existed carries no `spalten`. */
export const kartenGrid = (spalten: KartenSpalten | undefined): string =>
  spalten !== undefined && Object.hasOwn(KARTEN_GRID, spalten)
    ? KARTEN_GRID[spalten]
    : KARTEN_GRID["3"];

/**
 * Uniform cards side by side — "Unsere Angebote" and the like.
 *
 * The image is decoration (`alt=""`): the title beside it carries the meaning,
 * so an alt text would be announced twice. Index keys are right here because a
 * card holds no DOM state a reorder could strand — unlike `Akkordeon`, whose
 * `<details>` open state is exactly that.
 *
 * Purely presentational and free of Puck types — the block wrapper in
 * `puck-config.tsx` owns the editor placeholder.
 */
export function KartenRaster({ karten, spalten }: { karten: Karte[]; spalten: KartenSpalten }) {
  return (
    <div className={kartenGrid(spalten)}>
      {(karten ?? []).map((k, i) => (
        <Card key={i} className="flex flex-col overflow-hidden">
          {k.bild ? (
            <img src={k.bild} alt="" aria-hidden className="aspect-video w-full object-cover" />
          ) : null}
          <div className="flex flex-col gap-2 p-6">
            {k.titel ? <p className="font-semibold text-bdas-ink">{k.titel}</p> : null}
            {k.text ? <p className="whitespace-pre-line text-bdas-ink-body">{k.text}</p> : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
