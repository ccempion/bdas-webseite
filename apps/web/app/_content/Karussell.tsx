"use client";

import React from "react";

import { aktiveFolie } from "./karussell-darstellung";

export type Folie = {
  bild: string;
  titel: string;
  text: string;
};

/**
 * A rail of slides the reader clicks through — "Werte", "Persönlichkeiten".
 *
 * The rail is a CSS scroll container with snap points, so swipe, momentum and
 * the arrow keys come from the browser and cost nothing. Arrows and dots are
 * the only parts that need JavaScript, and they render only once the component
 * is alive: a control that does nothing is worse than no control, while the
 * rail underneath stays readable and scrollable without any script at all.
 *
 * One slide fills the view. That is the whole difference to `KartenRaster`,
 * which puts its cards side by side — here one thing at a time is the point,
 * which is why there is no "slides per view" field to get wrong.
 *
 * The image is decoration (`alt=""`): the title beside it carries the meaning.
 * A heading, when the board gives one, names the region for assistive tech; a
 * plain paragraph rather than a heading element, exactly as `Panel` does it,
 * because headings on a content page come from the `Ueberschrift` block.
 *
 * Purely presentational and free of Puck types — the block wrapper in
 * `puck-config.tsx` owns the editor placeholder.
 */
export function Karussell({ ueberschrift, folien }: { ueberschrift: string; folien: Folie[] }) {
  const liste = folien ?? [];
  const schiene = React.useRef<HTMLUListElement>(null);
  const [aktiv, setAktiv] = React.useState(0);
  const [lebendig, setLebendig] = React.useState(false);
  const titelId = React.useId();

  React.useEffect(() => setLebendig(true), []);

  if (liste.length === 0) return null;

  const bedienbar = lebendig && liste.length > 1;
  const gehZu = (index: number) => {
    const el = schiene.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  };
  const schiebe = (richtung: -1 | 1) => {
    const el = schiene.current;
    if (!el) return;
    el.scrollBy({ left: richtung * el.clientWidth, behavior: "smooth" });
  };
  const beimScrollen = () => {
    const el = schiene.current;
    if (!el) return;
    setAktiv(aktiveFolie(el.scrollLeft, el.clientWidth, liste.length));
  };

  // The card recipe's hover, on a round button — `Card.tsx` spells the same
  // four classes out, and `recipes.carousel` says the arrows follow it.
  const pfeil =
    "rounded-bdas-full border border-bdas-soft bg-bdas-surface p-2 text-bdas-ink " +
    "shadow-bdas-card transition duration-bdas-soft ease-bdas " +
    "hover:shadow-bdas-lift-md hover:-translate-y-bdas-lift-sm " +
    "disabled:pointer-events-none disabled:opacity-40";

  return (
    // `min-w-0` is load-bearing, not decoration. Dropped into a `Spalten` block
    // this section becomes a grid item, where `min-width: auto` resolves to the
    // content-based minimum — the rail's *whole* max-content width, every slide
    // side by side. The track then grows to fit it and the page overflows the
    // phone. The rail's own `overflow-x-auto` zeroes only its own minimum; the
    // section in between passes the max-content size straight up.
    <section
      aria-roledescription="Karussell"
      {...(ueberschrift ? { "aria-labelledby": titelId } : { "aria-label": "Karussell" })}
      className="flex min-w-0 flex-col gap-4"
    >
      {ueberschrift ? (
        <p id={titelId} className="font-semibold text-bdas-ink">
          {ueberschrift}
        </p>
      ) : null}

      <ul
        ref={schiene}
        tabIndex={0}
        onScroll={beimScrollen}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto"
      >
        {liste.map((f, i) => (
          <li
            key={i}
            aria-label={`Folie ${i + 1} von ${liste.length}`}
            className="w-full shrink-0 snap-center sm:flex sm:items-center sm:gap-6"
          >
            {f.bild ? (
              <img
                src={f.bild}
                alt=""
                aria-hidden
                className="mb-4 aspect-video w-full rounded-bdas object-cover sm:mb-0 sm:w-1/2"
              />
            ) : null}
            {f.titel || f.text ? (
              <div className="flex flex-col gap-2 sm:flex-1">
                {f.titel ? <p className="font-semibold text-bdas-ink">{f.titel}</p> : null}
                {f.text ? <p className="whitespace-pre-line text-bdas-ink-body">{f.text}</p> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {bedienbar ? (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Vorherige Folie"
            disabled={aktiv === 0}
            onClick={() => schiebe(-1)}
            className={pfeil}
          >
            ‹
          </button>
          <div className="flex items-center gap-2">
            {liste.map((_, i) => (
              <button
                key={i}
                type="button"
                data-karussell-punkt
                aria-label={`Folie ${i + 1} von ${liste.length}`}
                {...(i === aktiv ? { "aria-current": "true" } : {})}
                onClick={() => gehZu(i)}
                className={`h-2.5 w-2.5 rounded-bdas-full transition-colors duration-bdas-quick ${
                  i === aktiv ? "bg-bdas-red" : "bg-bdas-ink-muted"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Nächste Folie"
            disabled={aktiv === liste.length - 1}
            onClick={() => schiebe(1)}
            className={pfeil}
          >
            ›
          </button>
        </div>
      ) : null}
    </section>
  );
}
