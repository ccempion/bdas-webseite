/**
 * Deleting addresses outright — the board's tool against bots and junk signups.
 *
 * Unlike an unsubscribe this removes the row, and its consent log goes with it
 * through the cascade: there is no consent to prove for an address nobody gave.
 * A real person who wants out gets `unsubscribed`, which keeps the proof.
 */
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";

import type { Db } from "@bdas/db";

import { newsletterSubscribers } from "../schema";
import { loadResolved } from "./read";

/** How long a pending row without a confirmation link (the registration path)
 *  may wait for its account's verification before it counts as abandoned. */
export const STALE_PENDING_MS = 7 * 24 * 60 * 60 * 1000;

/** Quiet when the row is already gone: a double click is not an error. */
export async function removeSubscriber(db: Db, id: string): Promise<void> {
  const rows = await loadResolved(db);
  const target = rows.find((r) => r.id === id);
  if (!target) return;

  // The list shows one row per resolved address. Deleting only that one would
  // bring the duplicate it was hiding onto the list, so the board would watch
  // the address it just removed come straight back.
  const ids = rows.filter((r) => r.email === target.email).map((r) => r.id);
  await db.delete(newsletterSubscribers).where(inArray(newsletterSubscribers.id, ids));
}

/**
 * Deletes every `pending` row that can no longer become a subscription on its
 * own: a public signup whose confirmation link has expired, or a registration
 * row older than {@link STALE_PENDING_MS}. Returns how many went.
 *
 * Not by `created_at` alone: a public re-signup reuses the old row and keeps
 * its original date, so an age cut would delete a signup made a minute ago.
 */
export async function purgeStalePending(db: Db): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - STALE_PENDING_MS);
  const gone = await db
    .delete(newsletterSubscribers)
    .where(
      and(
        eq(newsletterSubscribers.status, "pending"),
        or(
          lt(newsletterSubscribers.confirmExpiresAt, now),
          and(
            isNull(newsletterSubscribers.confirmExpiresAt),
            lt(newsletterSubscribers.createdAt, cutoff),
          ),
        ),
      ),
    )
    .returning({ id: newsletterSubscribers.id });
  return gone.length;
}
