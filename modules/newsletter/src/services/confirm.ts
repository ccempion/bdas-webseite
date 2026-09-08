/**
 * Closing the loop on a consent: confirming it, and ending it.
 *
 * Single use is enforced through the *status*, not by deleting the hash — a
 * confirmation link gets clicked twice all the time, and the second click
 * deserves a friendly page rather than an error (spec §9). Every unsubscribe
 * path clears `confirm_token_hash` so a stale link cannot resurrect an ended
 * subscription.
 */
import { eq } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { NotFoundError } from "@bdas/errors";

import { recordConsent } from "../consent-log";
import { newsletterSubscribers } from "../schema";
import { hashToken } from "../tokens";
import type { ConfirmResult, ConsentContext } from "../types";

export async function confirmSubscription(
  db: Db,
  token: string,
  context?: ConsentContext,
): Promise<ConfirmResult> {
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.confirmTokenHash, hashToken(token)))
    .limit(1);

  // Unknown and expired are answered identically: once a link is old the two
  // are indistinguishable, and both want the same "sign up again" page.
  if (!row) return { status: "expired" };
  if (row.status === "subscribed") return { status: "already_confirmed" };
  if (!row.confirmExpiresAt || row.confirmExpiresAt.getTime() < Date.now()) {
    return { status: "expired" };
  }

  await db
    .update(newsletterSubscribers)
    .set({ status: "subscribed", confirmedAt: new Date(), unsubscribedAt: null })
    .where(eq(newsletterSubscribers.id, row.id));

  await recordConsent(db, {
    subscriberId: row.id,
    event: "confirmed",
    source: row.source,
    sourcePath: row.sourcePath,
    ...(context ? { context } : {}),
  });
  return { status: "confirmed" };
}

/** The permanent link from the confirmation mail — the only way out for an
 *  anonymous subscriber without an account (spec §3.4). */
export async function unsubscribeByToken(
  db: Db,
  token: string,
  context?: ConsentContext,
): Promise<void> {
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.unsubscribeTokenHash, hashToken(token)))
    .limit(1);
  if (!row) throw new NotFoundError("Abmeldelink ungültig.");
  if (row.status === "unsubscribed") return;
  await endSubscription(db, row.id, row.source, row.sourcePath, context);
}

/** The switch under "Mein Konto" (spec §3.4). Quiet when there is nothing to
 *  end — the surface offers this only when a subscription exists, so a call
 *  without one is a stale page, not an error worth showing. */
export async function unsubscribeAsUser(
  db: Db,
  input: { readonly userId: string; readonly context?: ConsentContext | undefined },
): Promise<void> {
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.userId, input.userId))
    .limit(1);
  if (!row || row.status === "unsubscribed") return;
  await endSubscription(db, row.id, row.source, row.sourcePath, input.context);
}

async function endSubscription(
  db: Db,
  id: string,
  source: string,
  sourcePath: string | null,
  context: ConsentContext | undefined,
): Promise<void> {
  await db
    .update(newsletterSubscribers)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
      confirmTokenHash: null,
      confirmExpiresAt: null,
    })
    .where(eq(newsletterSubscribers.id, id));

  await recordConsent(db, {
    subscriberId: id,
    event: "unsubscribed",
    source,
    sourcePath,
    ...(context ? { context } : {}),
  });
}

/**
 * Read-only lookup for the unsubscribe page (spec §3.4).
 *
 * The page must know whether the link is valid and which address it belongs to
 * BEFORE it offers the button — otherwise it can neither ask "really?" nor name
 * the address. `unsubscribeByToken` cannot answer that: it unsubscribes.
 *
 * Returns the address and nothing else. Whoever holds the link may unsubscribe;
 * that does not entitle them to the row.
 */
export async function peekUnsubscribeToken(
  db: Db,
  token: string,
): Promise<{ readonly email: string; readonly alreadyUnsubscribed: boolean } | null> {
  const [row] = await db
    .select({
      email: newsletterSubscribers.email,
      status: newsletterSubscribers.status,
    })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.unsubscribeTokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;
  return { email: row.email, alreadyUnsubscribed: row.status === "unsubscribed" };
}
