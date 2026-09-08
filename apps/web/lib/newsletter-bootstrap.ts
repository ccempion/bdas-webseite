import { getUserExport } from "@bdas/auth";
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

  setAccountEmailResolver({
    async resolve(db: Db, userIds: readonly string[]): Promise<Map<string, string>> {
      // `@bdas/auth` exposes only a single-user reader today. PR 2 resolves
      // exactly one id per request (the signed-in account), so this is one
      // query. BEFORE PR 5 ships the board list, auth needs a real batch read
      // (`getUserEmails(db, ids)`) — hundreds of rows through this loop would
      // be a textbook N+1, which is the very thing the batch signature exists
      // to prevent.
      const pairs = await Promise.all(
        userIds.map(async (id) => {
          const user = await getUserExport(db, id);
          return user ? ([id, user.email] as const) : null;
        }),
      );
      return new Map(pairs.filter((p): p is readonly [string, string] => p !== null));
    },
  });

  registerNewsletterSubscribers(getDb());
  booted = true;
}
