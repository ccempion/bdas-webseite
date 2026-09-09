import { desc } from "drizzle-orm";

import type { Db } from "@bdas/db";

import { accountMatch, type NewsletterAccount } from "../account-match";
import { getAccountEmailResolver } from "../resolver";
import { newsletterSubscribers } from "../schema";
import type {
  Counts,
  NewsletterSource,
  SubscriberRow,
  Subscription,
  SubscriptionStatus,
} from "../types";

export function rowToSubscription(r: typeof newsletterSubscribers.$inferSelect): Subscription {
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

/**
 * The account's subscription, whatever its status — the caller decides what a
 * `declined` or `unsubscribed` row means for its surface.
 *
 * Matches on the id *or* the address (see `accountMatch`). Matching on the id
 * alone was the bug: a row created through a public form after the account was
 * verified never gets one, so its owner was told they were not subscribed and
 * shown the signup form again.
 */
export async function getSubscriptionForAccount(
  db: Db,
  account: NewsletterAccount,
): Promise<Subscription | null> {
  const [row] = await db.select().from(newsletterSubscribers).where(accountMatch(account)).limit(1);
  return row ? rowToSubscription(row) : null;
}

export type SubscriberFilter = {
  readonly status?: SubscriptionStatus | undefined;
  readonly source?: NewsletterSource | undefined;
  readonly groupId?: string | null | undefined;
  /** Case-insensitive substring of the RESOLVED address. */
  readonly search?: string | undefined;
};

/**
 * Every row, address-resolved and deduplicated — the single pipeline behind
 * both the list and the counters, so the tiles can never contradict the table
 * beneath them.
 *
 * Deduplication cannot move into SQL: the resolved value lives in
 * modules/auth, not in this module's tables (spec §4). One full scan plus one
 * batched resolver call. Fine at the expected size; past ~50k rows the
 * counters want a materialized view.
 */
async function loadDeduped(db: Db): Promise<SubscriberRow[]> {
  const rows = await db
    .select()
    .from(newsletterSubscribers)
    .orderBy(desc(newsletterSubscribers.createdAt));

  const userIds = rows.flatMap((r) => (r.userId === null ? [] : [r.userId]));
  const resolved =
    userIds.length > 0
      ? await getAccountEmailResolver().resolve(db, userIds)
      : new Map<string, string>();

  const byEmail = new Map<string, SubscriberRow>();
  for (const r of rows) {
    const email = (r.userId === null ? r.email : (resolved.get(r.userId) ?? r.email))
      .trim()
      .toLowerCase();
    const row: SubscriberRow = {
      id: r.id,
      email,
      status: r.status as SubscriptionStatus,
      source: r.source as NewsletterSource,
      sourcePath: r.sourcePath,
      groupId: r.groupId,
      hasAccount: r.userId !== null,
      createdAt: r.createdAt,
      confirmedAt: r.confirmedAt,
    };
    const seen = byEmail.get(email);
    // The account row wins: its address is the one that keeps following the
    // person (spec §4). Otherwise the newer row stays — rows arrive desc.
    if (!seen || (row.hasAccount && !seen.hasAccount)) byEmail.set(email, row);
  }
  return [...byEmail.values()];
}

export async function listSubscribers(
  db: Db,
  filter: SubscriberFilter = {},
): Promise<SubscriberRow[]> {
  const needle = filter.search?.trim().toLowerCase();
  return (await loadDeduped(db))
    .filter((r) => {
      if (filter.status !== undefined && r.status !== filter.status) return false;
      if (filter.source !== undefined && r.source !== filter.source) return false;
      if (filter.groupId !== undefined && r.groupId !== filter.groupId) return false;
      // After resolution on purpose: a SQL LIKE would search the stale
      // duplicate key and miss the address the board actually sees.
      if (needle !== undefined && needle !== "" && !r.email.includes(needle)) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function countSubscribers(db: Db): Promise<Counts> {
  const tally: Record<SubscriptionStatus, number> = {
    pending: 0,
    subscribed: 0,
    unsubscribed: 0,
    declined: 0,
  };
  for (const r of await loadDeduped(db)) tally[r.status] += 1;
  return tally;
}
