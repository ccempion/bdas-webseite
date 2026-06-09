import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * Event routes are flag-gated until the events module is acceptance-complete
 * (rule 6). Flip BDAS_FLAG_EVENTS=true to preview.
 */
export function requireEventsFlag(): void {
  if (!isFlagOn("events")) notFound();
}
