/**
 * Per-key fixed-window rate limiter, persisted in `auth_rate_limits`.
 *
 * The window is fixed (not sliding) — when a key first hits the limiter,
 * a row is written with `expires_at = now + windowMs`. Subsequent calls
 * within the same window increment `count`. Once `expires_at` is in the
 * past, the row is overwritten with a fresh window on the next attempt.
 *
 * Adequate for login / register / reset-request flows where exact
 * fairness is less important than "stop the obvious bot". Replace with
 * a Redis-backed sliding window if scale demands it.
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { RateLimitError } from "@bdas/errors";

import { authRateLimits } from "./schema.js";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type RateLimitOpts = {
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
};

/**
 * Attempt the action. Throws RateLimitError if the key has exceeded `limit`
 * within the current window.
 */
export async function rateLimit(db: Db, opts: RateLimitOpts): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + opts.windowMs);

  // Upsert: if the key has expired or doesn't exist, start a fresh window.
  // Otherwise increment the existing count atomically.
  // Note the explicit ::timestamptz casts: postgres-js can't infer parameter
  // types from inside a CASE branch, so without the cast the Date binding
  // is sent as text and the driver rejects it.
  const expiresAtIso = expiresAt.toISOString();
  const result = await db
    .insert(authRateLimits)
    .values({
      key: opts.key,
      count: 1,
      windowStart: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        count: sql`CASE
          WHEN ${authRateLimits.expiresAt} < now()
          THEN 1
          ELSE ${authRateLimits.count} + 1
        END`,
        windowStart: sql`CASE
          WHEN ${authRateLimits.expiresAt} < now()
          THEN now()
          ELSE ${authRateLimits.windowStart}
        END`,
        expiresAt: sql`CASE
          WHEN ${authRateLimits.expiresAt} < now()
          THEN ${expiresAtIso}::timestamptz
          ELSE ${authRateLimits.expiresAt}
        END`,
      },
    })
    .returning({ count: authRateLimits.count });

  const count = result[0]?.count ?? 0;
  if (count > opts.limit) {
    throw new RateLimitError("Zu viele Versuche. Bitte später erneut versuchen.");
  }
}

/** Test helper — wipes all rate limit rows for a fresh state. */
export async function resetRateLimits(db: Db, keyPrefix?: string): Promise<void> {
  if (keyPrefix) {
    await db.delete(authRateLimits).where(sql`${authRateLimits.key} LIKE ${keyPrefix + "%"}`);
  } else {
    await db.delete(authRateLimits);
  }
}
