/**
 * The two ways into the list (spec §3). They differ only in how consent is
 * proven: a logged-in click is stronger evidence than a mail round-trip,
 * because authentication already supplied the second factor that
 * double-opt-in exists to establish.
 */
import { eq, or } from "drizzle-orm";

import type { Db } from "@bdas/db";

import { recordConsent } from "../consent-log";
import { resolveOne } from "../resolver";
import { newsletterSubscribers } from "../schema";
import { hashToken, newToken } from "../tokens";
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
