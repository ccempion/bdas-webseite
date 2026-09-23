import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * For embedding in someone else's page (the settings-page card): ask this
 * and render null, never `requireAccountDeletionFlag` — a 404 here would
 * take the whole settings page away over a switched-off side feature (same
 * reasoning as `newsletterEnabled`/`requireNewsletterFlag`).
 */
export function accountDeletionEnabled(): boolean {
  return isFlagOn("account_deletion");
}

/** For account-deletion-OWNED routes only (/konto-reaktivieren, /konto-loeschung-angefragt). */
export function requireAccountDeletionFlag(): void {
  if (!accountDeletionEnabled()) notFound();
}
