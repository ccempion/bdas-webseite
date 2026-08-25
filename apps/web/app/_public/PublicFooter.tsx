import React from "react";

import { isFlagOn } from "@bdas/feature-flags";

import { faqEnabled } from "../../lib/faq/enabled";
import { PublicFooterView } from "./PublicFooterView";

/** Public-site footer: contact, quick links, partner orgs, legal, socials.
 *  Contact details and social handles are placeholders (spec §8 open items).
 *
 *  Reads the flags and hands the markup to the pure view, so the Puck canvas
 *  can render the same footer without a server context. */
export function PublicFooter({
  privacyUrl,
  imprintUrl,
  termsUrl,
}: {
  privacyUrl: string;
  imprintUrl: string;
  termsUrl: string;
}) {
  return (
    <PublicFooterView
      privacyUrl={privacyUrl}
      imprintUrl={imprintUrl}
      termsUrl={termsUrl}
      showEvents={isFlagOn("events")}
      showGroups={isFlagOn("groups")}
      showFaq={faqEnabled()}
    />
  );
}
