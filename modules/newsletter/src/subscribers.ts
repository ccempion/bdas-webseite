/**
 * Bus subscribers — the one place this module *reacts* to another module's
 * event instead of publishing its own.
 *
 * `core/events` is synchronous and rethrows into the publisher (spec §7), and
 * `auth.user.verified` is published inside the verification path. A throw here
 * would fail a person's email verification over a newsletter row, so every
 * handler body is wrapped in `safe()` and can only ever log.
 */
import { eq, or } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { getEventBus, type AnyEvent, type EventHandler, type Subscription } from "@bdas/events";

import { recordConsent } from "./consent-log";
import { newsletterSubscribers } from "./schema";

/**
 * Structural copy of `auth.user.verified` (modules/auth/src/events.ts).
 * Declared locally so this module needs no dependency on @bdas/auth: it reacts
 * to a shape on the bus, not to auth's implementation (rule 2). The tradeoff
 * is that a rename in auth would not fail the build here — the registration
 * E2E in PR 2 is what catches that.
 */
type UserVerified = {
  readonly type: "auth.user.verified";
  readonly userId: string;
  readonly email: string;
  readonly at: Date;
};

let subs: Subscription[] = [];

function safe<E extends AnyEvent>(fn: EventHandler<E>): EventHandler<E> {
  return async (e: E) => {
    try {
      await fn(e);
    } catch (err) {
      console.error(`[newsletter] handler for "${e.type}" failed:`, err);
    }
  };
}

async function onVerified(db: Db, e: UserVerified): Promise<void> {
  const email = e.email.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(or(eq(newsletterSubscribers.userId, e.userId), eq(newsletterSubscribers.email, email)))
    .limit(1);
  if (!row) return;

  // The registration row (spec §3.3): the platform's own verification mail is
  // the double opt-in, so nothing is sent and no token is consumed.
  if (row.status === "pending") {
    await db
      .update(newsletterSubscribers)
      .set({
        status: "subscribed",
        confirmedAt: e.at,
        userId: e.userId,
        confirmTokenHash: null,
        confirmExpiresAt: null,
      })
      .where(eq(newsletterSubscribers.id, row.id));
    await recordConsent(db, {
      subscriberId: row.id,
      event: "confirmed",
      source: row.source,
      sourcePath: row.sourcePath,
    });
    return;
  }

  // An anonymous row that turns out to belong to an account: adopt it, leave
  // the status alone (spec §9, row 6).
  if (row.userId === null) {
    await db
      .update(newsletterSubscribers)
      .set({ userId: e.userId })
      .where(eq(newsletterSubscribers.id, row.id));
  }
}

/** Idempotent: re-registering replaces the previous subscriptions. */
export function registerNewsletterSubscribers(db: Db): void {
  for (const s of subs) s.unsubscribe();
  subs = [];

  const bus = getEventBus();
  subs.push(
    bus.subscribe<UserVerified>(
      "auth.user.verified",
      safe<UserVerified>((e) => onVerified(db, e)),
    ),
  );
}
