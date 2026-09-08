/**
 * Per-key fixed-window rate limiter, persisted in `newsletter_rate_limits`.
 *
 * A deliberate copy of `modules/auth/src/rate-limit.ts` (~40 lines): the
 * original is bound to `auth_rate_limits` and is not exported from auth's
 * index.ts, so reaching for it would be a cross-module table access and a
 * breach of rule 1. Extracting the algorithm into core/ was considered and
 * rejected because it would drag a security review onto an otherwise harmless
 * PR — revisit at a third call site (spec §4).
 *
 * The window is fixed, not sliding: it accepts up to 2x `limit` across a
 * window straddle (e.g. `limit` attempts just before the window boundary,
 * then `limit` more right after). Accepted property of this design, not a
 * defect — a sliding window costs more to maintain for a control this cheap.
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { RateLimitError } from "@bdas/errors";

import { newsletterRateLimits } from "./schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type RateLimitOpts = {
  /**
   * One row per key — a caller enforcing more than one budget against the
   * same identity (e.g. a per-15-minute and a per-day cap on one address)
   * must use a distinct key per budget, or the two windows clobber each
   * other's `expires_at`.
   */
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

  // Fail closed: an empty result (should not happen, DO UPDATE is
  // unconditional) must deny, not admit.
  return (result[0]?.count ?? Number.POSITIVE_INFINITY) <= opts.limit;
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
