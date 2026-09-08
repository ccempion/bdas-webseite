import React from "react";

import { type Ausrichtung, ausrichtungFlex, ausrichtungText } from "./ausrichtung";
import { buttonKlasse } from "./button-klasse";
import { isExternalHref, safeHref } from "./href";

export type HeroHintergrund = "hell" | "akzent" | "bild";
export type HeroHoehe = "kompakt" | "mittel" | "gross";

export type HeroProps = {
  ueberschrift: string;
  untertext: string;
  hintergrund: HeroHintergrund;
  bild: string;
  hoehe: HeroHoehe;
  ausrichtung: Ausrichtung;
  buttonLabel: string;
  buttonHref: string;
};

/** Height presets. Arbitrary-value literals rather than tokens: the design
 *  system has no height scale, and `70vh` is already the established hero
 *  height (`app/_public/landing/HeroSlideshow.tsx`). Literal strings, so
 *  Tailwind's scanner sees each one. */
const HOEHE: Record<HeroHoehe, string> = {
  kompakt: "min-h-[16rem]",
  mittel: "min-h-[24rem]",
  gross: "min-h-[70vh]",
};

/** Resting surface behind the content. `bild` shares the light fallback: it is
 *  what shows until the board has actually uploaded a photo. */
const FLAECHE: Record<HeroHintergrund, string> = {
  hell: "bg-bdas-overlay-soft",
  akzent: "bg-bdas-red",
  bild: "bg-bdas-overlay-soft",
};

const heroHoehe = (h: HeroHoehe | undefined): string =>
  h !== undefined && Object.hasOwn(HOEHE, h) ? HOEHE[h] : HOEHE.mittel;

const heroFlaeche = (h: HeroHintergrund | undefined): string =>
  h !== undefined && Object.hasOwn(FLAECHE, h) ? FLAECHE[h] : FLAECHE.hell;

/**
 * Opening section for a content page: headline, sub-text, optional button, on
 * one of three grounds.
 *
 * `<h2>`, not `<h1>`: the routes that carry a Hero render their own page `<h1>`
 * above the Puck content, and a second one is an accessibility regression.
 *
 * Purely presentational and free of Puck types — the block wrapper in
 * `puck-config.tsx` owns the editor placeholder, so this file has no
 * `isEditing` branch and stays directly testable.
 */
export function Hero({
  ueberschrift,
  untertext,
  hintergrund,
  bild,
  hoehe,
  ausrichtung,
  buttonLabel,
  buttonHref,
}: HeroProps) {
  const mitBild = hintergrund === "bild" && (bild ?? "") !== "";
  // White text needs a dark ground under it. A photo Hero without a photo yet
  // falls back to the light surface, so it must stay dark-on-light.
  const dunkel = hintergrund === "akzent" || mitBild;
  const href = safeHref(buttonHref ?? "");
  const label = (buttonLabel ?? "").trim();
  const hoeheKlasse = heroHoehe(hoehe);

  return (
    // `isolate` opens a stacking context so the `-z-10` layers below sit behind
    // the content but never behind the section's own background.
    <section
      className={`relative isolate overflow-hidden rounded-bdas shadow-bdas-card-low ${hoeheKlasse} ${
        mitBild ? "" : heroFlaeche(hintergrund)
      }`}
    >
      {mitBild ? (
        <>
          {/* An <img>, not `background-image: url(...)`: `bild` is
              editor-supplied and a quote or paren in it would break out of the
              url() and inject CSS. React escapes an attribute; it does not
              escape a style string. `alt=""` because the headline carries the
              meaning — this is wallpaper. */}
          <img
            src={bild}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
          <div aria-hidden className="absolute inset-0 -z-10 bg-bdas-hero-scrim" />
        </>
      ) : null}
      <div
        className={`flex ${hoeheKlasse} flex-col justify-center gap-4 p-8 sm:p-12 ${ausrichtungText(
          ausrichtung,
        )}`}
      >
        {ueberschrift ? (
          <h2
            className={`text-3xl font-semibold sm:text-4xl ${
              dunkel ? "text-bdas-ink-on-brand" : "text-bdas-ink"
            }`}
          >
            {ueberschrift}
          </h2>
        ) : null}
        {untertext ? (
          <p
            className={`whitespace-pre-line ${
              dunkel ? "text-bdas-ink-on-brand" : "text-bdas-ink-body"
            }`}
          >
            {untertext}
          </p>
        ) : null}
        {href && label ? (
          <div className={`flex ${ausrichtungFlex(ausrichtung)}`}>
            {isExternalHref(href) ? (
              <a
                href={href}
                rel="noopener noreferrer"
                target="_blank"
                className={buttonKlasse(dunkel ? "hell" : "primaer")}
              >
                {label}
              </a>
            ) : (
              <a href={href} className={buttonKlasse(dunkel ? "hell" : "primaer")}>
                {label}
              </a>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
