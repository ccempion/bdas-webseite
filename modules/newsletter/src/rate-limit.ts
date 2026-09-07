/**
 * Per-key fixed-window rate limiter, persisted in `newsletter_rate_limits`.
 *
 * A deliberate copy of `modules/auth/src/rate-limit.ts` (~40 lines): the
 * original is bound to `auth_rate_limits` and is not exported from auth's
 * index.ts, so reaching for it would be a cross-module table access and a
 * breach of rule 1. Extracting the algorithm into core/ was considered and
 * rejected because it would drag a security review onto an otherwise harmless
 * PR — revisit at a third call site (spec §4).
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { RateLimitError } from "@bdas/errors";

import { newsletterRateLimits } from "./schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type RateLimitOpts = {
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
};

/** Counts one attempt and reports whether it stayed inside the limit. */
export async function tryRateLimit(db: Db, opts: RateLimitOpts): Promise<boolean> {
  const now = new Date();
  const expiresAtIso = new Date(now.getTime() + opts.windowMs).toISOString();

  // Upsert: an expired or missing key starts a fresh window, otherwise the
  // count increments atomically. The explicit ::timestamptz cast is required —
  // postgres-js cannot infer a parameter type inside a CASE branch and would
  // send the Date as text.
  const result = await db
    .insert(newsletterRateLimits)
    .values({
      key: opts.key,
      count: 1,
      windowStart: now,
      expiresAt: new Date(now.getTime() + opts.windowMs),
    })
    .onConflictDoUpdate({
      target: newsletterRateLimits.key,
      set: {
        count: sql`CASE
          WHEN ${newsletterRateLimits.expiresAt} < now()
          THEN 1
          ELSE ${newsletterRateLimits.count} + 1
        END`,
        windowStart: sql`CASE
          WHEN ${newsletterRateLimits.expiresAt} < now()
          THEN now()
          ELSE ${newsletterRateLimits.windowStart}
        END`,
        expiresAt: sql`CASE
          WHEN ${newsletterRateLimits.expiresAt} < now()
          THEN ${expiresAtIso}::timestamptz
          ELSE ${newsletterRateLimits.expiresAt}
        END`,
      },
    })
    .returning({ count: newsletterRateLimits.count });

  return (result[0]?.count ?? 0) <= opts.limit;
}

/** Throws RateLimitError once the key has exceeded `limit` in the window. */
export async function rateLimit(db: Db, opts: RateLimitOpts): Promise<void> {
  if (!(await tryRateLimit(db, opts))) {
    throw new RateLimitError("Zu viele Versuche. Bitte später erneut versuchen.");
  }
}

/** Test helper — wipes rate limit rows, optionally only one key prefix. */
export async function resetRateLimits(db: Db, keyPrefix?: string): Promise<void> {
  if (keyPrefix) {
    await db
      .delete(newsletterRateLimits)
      .where(sql`${newsletterRateLimits.key} LIKE ${keyPrefix + "%"}`);
  } else {
    await db.delete(newsletterRateLimits);
  }
}
