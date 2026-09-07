import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { RateLimitError } from "@bdas/errors";

import { rateLimit, resetRateLimits, tryRateLimit } from "./rate-limit";
import { dbReachable, setupNewsletterDb } from "./test-db";

const reachable = await dbReachable();

describe.skipIf(!reachable)("newsletter rate limit", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupNewsletterDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("allows exactly `limit` attempts inside one window, then throws", async () => {
    const opts = { key: "ip:1.2.3.4", limit: 3, windowMs: 60_000 };
    await rateLimit(t.db, opts);
    await rateLimit(t.db, opts);
    await rateLimit(t.db, opts);
    await expect(rateLimit(t.db, opts)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("starts a fresh window once the old one has expired", async () => {
    const key = "ip:5.6.7.8";
    await rateLimit(t.db, { key, limit: 1, windowMs: 60_000 });
    await expect(rateLimit(t.db, { key, limit: 1, windowMs: 60_000 })).rejects.toThrow();
    // Age the window out rather than sleeping.
    await t.client.unsafe(
      `UPDATE newsletter_rate_limits SET expires_at = now() - interval '1 second'`,
    );
    await expect(rateLimit(t.db, { key, limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
    // The new window must be armed with a future expires_at, not left in the
    // past — otherwise every later call would keep taking the "fresh window"
    // branch and the limiter would never fire again.
    await expect(rateLimit(t.db, { key, limit: 1, windowMs: 60_000 })).rejects.toThrow();
  });

  it("keeps keys independent", async () => {
    await rateLimit(t.db, { key: "a", limit: 1, windowMs: 60_000 });
    await expect(rateLimit(t.db, { key: "b", limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
  });

  it("tryRateLimit reports the verdict instead of throwing", async () => {
    const opts = { key: "addr:a@example.org", limit: 1, windowMs: 60_000 };
    expect(await tryRateLimit(t.db, opts)).toBe(true);
    expect(await tryRateLimit(t.db, opts)).toBe(false);
  });

  it("resetRateLimits clears by prefix", async () => {
    await rateLimit(t.db, { key: "ip:9.9.9.9", limit: 1, windowMs: 60_000 });
    await rateLimit(t.db, { key: "addr:x@example.org", limit: 1, windowMs: 60_000 });
    await resetRateLimits(t.db, "ip:");
    await expect(
      rateLimit(t.db, { key: "ip:9.9.9.9", limit: 1, windowMs: 60_000 }),
    ).resolves.toBeUndefined();
    await expect(
      rateLimit(t.db, { key: "addr:x@example.org", limit: 1, windowMs: 60_000 }),
    ).rejects.toThrow();
  });
});
