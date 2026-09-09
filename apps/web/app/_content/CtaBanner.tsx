import React from "react";

import { buttonKlasse } from "./button-klasse";
import { isExternalHref, safeHref } from "./href";

export type CtaFlaeche = "akzent" | "neutral";

export type CtaBannerProps = {
  ueberschrift: string;
  text: string;
  buttonLabel: string;
  buttonHref: string;
  flaeche?: CtaFlaeche | undefined;
};

/** The two grounds a banner can sit on. `akzent` is the default: ADR 0036
 *  grants the brand accent to this block precisely because a call to action is
 *  an active surface, not body text (CLAUDE.md §7). */
const FLAECHE: Record<CtaFlaeche, string> = {
  akzent: "bg-bdas-red",
  neutral: "bg-bdas-overlay-soft",
};

const ctaFlaeche = (f: CtaFlaeche | undefined): string =>
  f !== undefined && Object.hasOwn(FLAECHE, f) ? FLAECHE[f] : FLAECHE.akzent;

/**
 * A single highlighted call to action: headline, one sentence, one button.
 *
 * Centred at every width and one column always — a banner is one statement, and
 * the split layouts belong to `Hero`. The headline is an `<h2>`: the page `<h1>`
 * is a Hero or an `Überschrift (h1)` block (ADR 0038).
 *
 * Purely presentational and free of Puck types — the block wrapper in
 * `puck-config.tsx` owns the editor placeholder, so this file has no
 * `isEditing` branch and stays directly testable.
 */
export function CtaBanner({
  ueberschrift,
  text,
  buttonLabel,
  buttonHref,
  flaeche,
}: CtaBannerProps) {
  const dunkel = ctaFlaeche(flaeche) === FLAECHE.akzent;
  const href = safeHref(buttonHref ?? "");
  const label = (buttonLabel ?? "").trim();

  return (
    <section
      className={`flex flex-col items-center gap-4 rounded-bdas p-8 text-center shadow-bdas-card-low sm:p-12 ${ctaFlaeche(
        flaeche,
      )}`}
    >
      {ueberschrift ? (
        <h2
          className={`text-2xl font-semibold sm:text-3xl ${
            dunkel ? "text-bdas-ink-on-brand" : "text-bdas-ink"
          }`}
        >
          {ueberschrift}
        </h2>
      ) : null}
      {text ? (
        <p
          className={`max-w-2xl whitespace-pre-line ${
            dunkel ? "text-bdas-ink-on-brand" : "text-bdas-ink-body"
          }`}
        >
          {text}
        </p>
      ) : null}
      {href && label ? (
        isExternalHref(href) ? (
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
        )
      ) : null}
    </section>
  );
}
