"use client";

import React from "react";

import { coverflow } from "@bdas/design-system";

import {
  aktiveFolie,
  coverflowStil,
  effektiveDarstellung,
  istBeschriftung,
  relativeLage,
  type Beschriftung,
  type Darstellung,
} from "./karussell-darstellung";

export type Folie = {
  bild: string;
  titel: string;
  text: string;
};

/**
 * The slide pitch — one slide's width plus the gap to the next — read off the
 * first two slides. A rail no browser has laid out yet reports nothing, and
 * then its own width is the honest stand-in: in the flat presentation the two
 * numbers are the same anyway.
 *
 * Deliberately no `ResizeObserver`. The three call sites — mount, scroll and a
 * `resize` listener — cover every way the number can change, and happy-dom
 * does not bring the observer along.
 */
const abstandVon = (el: HTMLUListElement): number => {
  const kinder = el.children;
  const gemessen =
    kinder.length >= 2
      ? (kinder[1] as HTMLElement).offsetLeft - (kinder[0] as HTMLElement).offsetLeft
      : ((kinder[0] as HTMLElement | undefined)?.offsetWidth ?? 0);
  return gemessen || el.clientWidth;
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
 * Two presentations. Flat is the original: one slide fills the view, side by
 * side with its text from `sm` up. Coverflow narrows the slide, pads the rail
 * so the first and last can still reach the middle, and tilts the neighbours
 * away from the viewer. The tilt interpolates from the live scroll position
 * rather than from the active index, so the deck follows the finger instead of
 * snapping over when the index flips — which is why `scrollLeft` is state here
 * and the active slide is derived from it.
 *
 * The image is decoration (`alt=""`): the title beside it carries the meaning.
 * A heading, when the board gives one, names the region for assistive tech; a
 * plain paragraph rather than a heading element, exactly as `Panel` does it,
 * because headings on a content page come from the `Ueberschrift` block.
 *
 * Purely presentational and free of Puck types — the block wrapper in
 * `puck-config.tsx` owns the editor placeholder.
 */
export function Karussell({
  ueberschrift,
  folien,
  darstellung,
  beschriftung,
  imEditor,
}: {
  ueberschrift: string;
  folien: Folie[];
  darstellung?: Darstellung | undefined;
  beschriftung?: Beschriftung | undefined;
  imEditor?: boolean | undefined;
}) {
  const liste = folien ?? [];
  const schiene = React.useRef<HTMLUListElement>(null);
  const rahmen = React.useRef<number | null>(null);
  const reduziert = React.useRef(false);
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const [abstand, setAbstand] = React.useState(0);
  const [lebendig, setLebendig] = React.useState(false);
  const titelId = React.useId();

  React.useEffect(() => {
    reduziert.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const miss = () => {
      const el = schiene.current;
      if (!el) return;
      setAbstand(abstandVon(el));
      setScrollLeft(el.scrollLeft);
    };
    miss();
    setLebendig(true);
    window.addEventListener("resize", miss);
    return () => {
      window.removeEventListener("resize", miss);
      if (rahmen.current !== null) cancelAnimationFrame(rahmen.current);
      rahmen.current = null;
    };
  }, []);

  if (liste.length === 0) return null;

  const art = effektiveDarstellung(darstellung, liste.length, imEditor ?? false);
  const raeumlich = art === "coverflow";
  // Documents saved before this field exists hand back `undefined`.
  const platzierung = istBeschriftung(beschriftung) ? beschriftung : "unter";
  const aktiv = aktiveFolie(scrollLeft, abstand, liste.length);
  const zentral = liste[aktiv];
  const bedienbar = lebendig && liste.length > 1;

  const lies = () => {
    const el = schiene.current;
    if (!el) return;
    setAbstand(abstandVon(el));
    setScrollLeft(el.scrollLeft);
  };
  // A finger fires `scroll` far more often than the screen repaints. The first
  // event of a frame is read straight away — a tilt that lags the finger is
  // the whole thing this presentation is for — and every further event in the
  // same frame is folded into one trailing read.
  const beimScrollen = () => {
    if (rahmen.current !== null) return;
    lies();
    rahmen.current = requestAnimationFrame(() => {
      rahmen.current = null;
      lies();
    });
  };
  const gehZu = (index: number) => {
    const el = schiene.current;
    if (!el) return;
    el.scrollTo({ left: index * abstandVon(el), behavior: "smooth" });
  };
  const schiebe = (richtung: -1 | 1) => {
    const el = schiene.current;
    if (!el) return;
    el.scrollBy({ left: richtung * abstandVon(el), behavior: "smooth" });
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
        // Tilted slides stand taller than the rail; `overflow-x-auto` would
        // clip them top and bottom without the padding.
        className={`flex snap-x snap-mandatory gap-6 overflow-x-auto${raeumlich ? " py-8" : ""}`}
        {...(raeumlich
          ? {
              style: {
                perspective: `${coverflow.perspective}px`,
                paddingInline: `${(100 - coverflow.slideWidthPct) / 2}%`,
              },
            }
          : {})}
      >
        {liste.map((f, i) => (
          <li
            key={i}
            aria-label={`Folie ${i + 1} von ${liste.length}`}
            className={
              raeumlich
                ? "relative shrink-0 snap-center transition-none [transform-style:preserve-3d]"
                : "w-full shrink-0 snap-center sm:flex sm:items-center sm:gap-6"
            }
            {...(raeumlich
              ? {
                  style: {
                    // Not `slideWidthPct` — the rail's `paddingInline` already
                    // took the peek out of its content box, and a flex item's
                    // percentage resolves against that. 100% of it *is*
                    // `slideWidthPct` of the rail, which is what puts slide i
                    // at exactly `i * pitch` the way `relativeLage` assumes.
                    width: "100%",
                    ...coverflowStil(relativeLage(scrollLeft, abstand, i), reduziert.current),
                  },
                }
              : {})}
          >
            {raeumlich ? (
              <>
                {f.bild ? (
                  // Coverflow keeps several slides on screen at once, so
                  // without this every photo in the deck is fetched on load.
                  <img
                    src={f.bild}
                    alt=""
                    aria-hidden
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding="async"
                    className="aspect-video w-full rounded-bdas object-cover"
                  />
                ) : null}
                {platzierung === "auf" && (f.titel || f.text) ? (
                  <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 rounded-b-bdas bg-bdas-hero-scrim p-4">
                    {f.titel ? (
                      <p className="font-semibold text-bdas-ink-on-brand">{f.titel}</p>
                    ) : null}
                    {f.text ? (
                      <p className="whitespace-pre-line text-bdas-ink-on-brand">{f.text}</p>
                    ) : null}
                  </div>
                ) : null}
                {lebendig ? (
                  // A sibling laid over the image, never a wrapper: re-parenting
                  // the `<img>` at hydration restarts an in-flight load.
                  <button
                    type="button"
                    data-karussell-sprung
                    aria-label={`Zu Folie ${i + 1} von ${liste.length} springen`}
                    disabled={i === aktiv}
                    onClick={() => gehZu(i)}
                    className="absolute inset-0 rounded-bdas disabled:pointer-events-none"
                  />
                ) : null}
              </>
            ) : (
              <>
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
                    {f.text ? (
                      <p className="whitespace-pre-line text-bdas-ink-body">{f.text}</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>

      {raeumlich && platzierung === "unter" && (zentral?.titel || zentral?.text) ? (
        // Keyed on the active slide so the caption fades in on every change
        // instead of swapping its text mid-sentence.
        <div key={aktiv} className="flex animate-bdas-fade-slide-up flex-col gap-2 text-center">
          {zentral.titel ? <p className="font-semibold text-bdas-ink">{zentral.titel}</p> : null}
          {zentral.text ? (
            <p className="whitespace-pre-line text-bdas-ink-body">{zentral.text}</p>
          ) : null}
        </div>
      ) : null}

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
