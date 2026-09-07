/**
 * The two ways into the list (spec §3). They differ only in how consent is
 * proven: a logged-in click is stronger evidence than a mail round-trip,
 * because authentication already supplied the second factor that
 * double-opt-in exists to establish.
 */
import { eq, or } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import { recordConsent } from "../consent-log";
import { CONFIRM_PATH, type AlreadySubscribed, type ConfirmationRequested } from "../events";
import { tryRateLimit } from "../rate-limit";
import { resolveOne } from "../resolver";
import { newsletterSubscribers } from "../schema";
import { CONFIRM_TTL_MS, hashToken, newToken } from "../tokens";
import { newId, type ConsentContext, type NewsletterSource, type Subscription } from "../types";
import { rowToSubscription } from "./read";

export type SubscribeAsUserInput = {
  readonly userId: string;
  readonly source: NewsletterSource;
  readonly sourcePath?: string | null | undefined;
  readonly groupId?: string | null | undefined;
  readonly context?: ConsentContext | undefined;
};

/**
 * One-click subscribe for an authenticated account. No confirmation mail
 * (spec §3.1). Idempotent: an already-subscribed account gets its row back
 * untouched and no second consent-log entry.
 */
export async function subscribeAsUser(
  db: Db,
  input: SubscribeAsUserInput,
): Promise<Subscription> {
  // A resolvable address lets an earlier anonymous row be adopted rather than
  // duplicated. When it cannot be resolved, a synthetic key satisfies the
  // NOT NULL/UNIQUE contract without inventing a plausible address.
  const resolved = (await resolveOne(db, input.userId))?.trim().toLowerCase() ?? null;
  const email = resolved ?? `user:${input.userId}`;

  const existing = await db
    .select()
    .from(newsletterSubscribers)
    .where(
      or(eq(newsletterSubscribers.userId, input.userId), eq(newsletterSubscribers.email, email)),
    )
    .limit(1);

  const now = new Date();
  const row = existing[0];

  if (row) {
    if (row.status === "subscribed" && row.userId === input.userId) {
      return rowToSubscription(row);
    }
    const [updated] = await db
      .update(newsletterSubscribers)
      .set({
        userId: input.userId,
        status: "subscribed",
        confirmedAt: row.confirmedAt ?? now,
        unsubscribedAt: null,
        // A live confirmation link must not survive into the subscribed state.
        confirmTokenHash: null,
        confirmExpiresAt: null,
      })
      .where(eq(newsletterSubscribers.id, row.id))
      .returning();

    await recordConsent(db, {
      subscriberId: row.id,
      // "resubscribed" is the log's word for a *new* consent replacing an
      // ended one (spec §9); a pending row simply completing is "subscribed".
      event:
        row.status === "unsubscribed" || row.status === "declined" ? "resubscribed" : "subscribed",
      source: input.source,
      sourcePath: input.sourcePath ?? null,
      ...(input.context ? { context: input.context } : {}),
    });
    return rowToSubscription(updated!);
  }

  const [created] = await db
    .insert(newsletterSubscribers)
    .values({
      id: newId(),
      email,
      userId: input.userId,
      status: "subscribed",
      unsubscribeTokenHash: hashToken(newToken()),
      source: input.source,
      sourcePath: input.sourcePath ?? null,
      groupId: input.groupId ?? null,
      confirmedAt: now,
    })
    .returning();

  await recordConsent(db, {
    subscriberId: created!.id,
    event: "subscribed",
    source: input.source,
    sourcePath: input.sourcePath ?? null,
    ...(input.context ? { context: input.context } : {}),
  });
  return rowToSubscription(created!);
}

/** Deliberately permissive: the confirmation mail is the real check. This
 *  only stops obvious typos and keeps junk out of the duplicate key. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** At most one confirmation mail per address per 15 minutes and 3 per day
 *  (spec §8 no. 1). Exceeding it suppresses the mail — never the answer. */
const MAIL_WINDOW_MS = 15 * 60 * 1000;
const MAIL_DAY_MS = 24 * 60 * 60 * 1000;

export type SubscribePubliclyInput = {
  readonly email: string;
  readonly source: NewsletterSource;
  readonly sourcePath?: string | null | undefined;
  readonly groupId?: string | null | undefined;
  readonly context?: ConsentContext | undefined;
};

/**
 * Anonymous signup with full double-opt-in (spec §3.2). Returns `void` in
 * every case — new, known, unsubscribed or an account holder are
 * indistinguishable from the outside (spec §8 no. 4), otherwise the form
 * becomes a tool for checking who is close to the federation.
 */
export async function subscribePublicly(db: Db, input: SubscribePubliclyInput): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError("Bitte gib eine gültige E-Mail-Adresse an.");
  }

  const [existing] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, email))
    .limit(1);

  // Throttle after the lookup but before anything is published: the counter
  // must tick for every attempt, including the ones that send nothing.
  const mayMail =
    (await tryRateLimit(db, { key: `nl:addr:${email}`, limit: 1, windowMs: MAIL_WINDOW_MS })) &&
    (await tryRateLimit(db, { key: `nl:addr:day:${email}`, limit: 3, windowMs: MAIL_DAY_MS }));

  if (existing?.status === "subscribed") {
    if (mayMail) {
      await getEventBus().publish<AlreadySubscribed>({
        type: "newsletter.already_subscribed",
        email,
        at: new Date(),
      });
    }
    return;
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS);
  let subscriberId: string;

  if (existing) {
    subscriberId = existing.id;
    await db
      .update(newsletterSubscribers)
      .set({
        status: "pending",
        confirmTokenHash: hashToken(token),
        confirmExpiresAt: expiresAt,
        unsubscribedAt: null,
      })
      .where(eq(newsletterSubscribers.id, existing.id));

    // A pending row is the same consent still in flight; a row that had ended
    // is a new consent and says so in the log (spec §9).
    if (existing.status === "unsubscribed" || existing.status === "declined") {
      await recordConsent(db, {
        subscriberId,
        event: "resubscribed",
        source: input.source,
        sourcePath: input.sourcePath ?? null,
        ...(input.context ? { context: input.context } : {}),
      });
    }
  } else {
    const [created] = await db
      .insert(newsletterSubscribers)
      .values({
        id: newId(),
        email,
        status: "pending",
        confirmTokenHash: hashToken(token),
        confirmExpiresAt: expiresAt,
        unsubscribeTokenHash: hashToken(newToken()),
        source: input.source,
        sourcePath: input.sourcePath ?? null,
        groupId: input.groupId ?? null,
      })
      .returning();
    subscriberId = created!.id;
    await recordConsent(db, {
      subscriberId,
      event: "subscribed",
      source: input.source,
      sourcePath: input.sourcePath ?? null,
      ...(input.context ? { context: input.context } : {}),
    });
  }

  if (!mayMail) return;

  const base = (input.context?.siteUrl ?? "").replace(/\/$/, "");
  await getEventBus().publish<ConfirmationRequested>({
    type: "newsletter.confirmation_requested",
    email,
    token,
    confirmUrl: `${base}${CONFIRM_PATH}?token=${encodeURIComponent(token)}`,
    at: new Date(),
  });
}
