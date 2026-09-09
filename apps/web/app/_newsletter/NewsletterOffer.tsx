import React from "react";

import { NewsletterOneClick } from "./NewsletterOneClick";
import { NewsletterSignupForm } from "./NewsletterSignupForm";
import type { NewsletterViewerState } from "./viewer-state";

/**
 * The §6 matrix, in one place: which newsletter offer a given visitor sees.
 *
 *   ausgeloggt                  → Eingabefeld, Double-Opt-In
 *   eingeloggt, nicht abonniert → Ein-Klick-Knopf, keine Mail
 *   eingeloggt, abonniert       → nichts
 *   eingeloggt, declined        → nichts
 *
 * Purely presentational: it decides from the `state` prop and reads nothing
 * itself. That is what lets the same component serve a Server Component page
 * and the Puck canvas, which is a client tree without a server context. The
 * host reads the state with `readNewsletterViewerState`.
 *
 * Always `variant="plain"`. The brand-red H1 shape stays with the footer card
 * and /newsletter — two red blocks on one page stop being emphasis (§13.3).
 */
export function NewsletterOffer({
  state,
  source,
  sourcePath,
  heading = "Bleib in Verbindung",
}: {
  state: NewsletterViewerState;
  source: string;
  sourcePath: string;
  heading?: string;
}) {
  if (state === "off" || state === "done") return null;

  if (state === "member") {
    return <NewsletterOneClick source={source} sourcePath={sourcePath} heading={heading} />;
  }

  return (
    <NewsletterSignupForm
      source={source}
      sourcePath={sourcePath}
      variant="plain"
      heading={heading}
    />
  );
}
