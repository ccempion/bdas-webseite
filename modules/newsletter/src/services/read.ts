import { eq } from "drizzle-orm";

import type { Db } from "@bdas/db";

import { newsletterSubscribers } from "../schema";
import type { NewsletterSource, Subscription, SubscriptionStatus } from "../types";

export function rowToSubscription(
  r: typeof newsletterSubscribers.$inferSelect,
): Subscription {
  return {
    id: r.id,
    email: r.email,
    userId: r.userId,
    status: r.status as SubscriptionStatus,
    source: r.source as NewsletterSource,
    sourcePath: r.sourcePath,
    groupId: r.groupId,
    createdAt: r.createdAt,
    confirmedAt: r.confirmedAt,
    unsubscribedAt: r.unsubscribedAt,
  };
}

/** The account's subscription, whatever its status — the caller decides what
 *  a `declined` or `unsubscribed` row means for its surface. */
export async function getSubscriptionForUser(
  db: Db,
  userId: string,
): Promise<Subscription | null> {
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.userId, userId))
    .limit(1);
  return row ? rowToSubscription(row) : null;
}
