import { getUserEmails } from "@bdas/auth";
import { getDb, type Db } from "@bdas/db";
import { registerNewsletterSubscribers, setAccountEmailResolver } from "@bdas/newsletter";

import { newsletterEnabled } from "../app/_newsletter/flag";

let booted = false;

/**
 * Idempotent newsletter bootstrap: wires the AccountEmailResolver and
 * subscribes to `auth.user.verified`, but only when the flag is on, so the
 * module is inert in production until acceptance-complete (rule 6 applied to
 * a non-route module).
 */
export function bootNewsletter(): void {
  if (booted) return;
  if (!newsletterEnabled()) return; // not latched — a flag-off boot must not permanently disable wiring

  // One query for the whole page, which is what the batched signature always
  // promised. It used to loop `getUserExport` per id — fine while the only
  // caller resolved the one signed-in account, a query per subscriber once
  // the board list arrived.
  setAccountEmailResolver({
    resolve: (db: Db, userIds: readonly string[]): Promise<Map<string, string>> =>
      getUserEmails(db, userIds),
  });

  registerNewsletterSubscribers(getDb());
  booted = true;
}
