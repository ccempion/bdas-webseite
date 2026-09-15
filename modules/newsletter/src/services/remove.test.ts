import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { setAccountEmailResolver } from "../resolver";
import { newsletterConsentLog, newsletterSubscribers } from "../schema";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { purgeStalePending, removeSubscriber, STALE_PENDING_MS } from "./remove";

const reachable = await dbReachable();

const noResolver = {
  async resolve() {
    return new Map<string, string>();
  },
};

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

describe.skipIf(!reachable)("newsletter remove services", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupNewsletterDb();
    setAccountEmailResolver(noResolver);
  });
  afterEach(async () => {
    await t.cleanup();
    setAccountEmailResolver(noResolver);
  });

  const add = async (over: Partial<typeof newsletterSubscribers.$inferInsert> = {}) => {
    const id = over.id ?? `nls_${Math.random().toString(36).slice(2, 10)}`;
    await t.db.insert(newsletterSubscribers).values({
      id,
      email: `${id}@example.org`,
      status: "subscribed",
      unsubscribeTokenHash: `h_${id}`,
      source: "footer",
      ...over,
    });
    return id;
  };

  const ids = async () =>
    (await t.db.select({ id: newsletterSubscribers.id }).from(newsletterSubscribers))
      .map((r) => r.id)
      .sort();

  describe("removeSubscriber", () => {
    it("deletes the row together with its consent log, and nothing else", async () => {
      await add({ id: "nls_bot" });
      await add({ id: "nls_keep" });
      await t.db
        .insert(newsletterConsentLog)
        .values({ id: "nlc_1", subscriberId: "nls_bot", event: "subscribed" });

      await removeSubscriber(t.db, "nls_bot");

      expect(await ids()).toEqual(["nls_keep"]);
      const log = await t.db
        .select()
        .from(newsletterConsentLog)
        .where(eq(newsletterConsentLog.subscriberId, "nls_bot"));
      expect(log).toEqual([]);
    });

    it("also deletes the duplicate the list was hiding behind the same address", async () => {
      await add({ id: "nls_anon", email: "b@example.org" });
      await add({ id: "nls_acct", email: "a@example.org", userId: "u1" });
      await add({ id: "nls_other" });
      setAccountEmailResolver({
        async resolve() {
          return new Map([["u1", "b@example.org"]]);
        },
      });

      await removeSubscriber(t.db, "nls_acct");

      expect(await ids()).toEqual(["nls_other"]);
    });

    it("is quiet about an id that no longer exists", async () => {
      await add({ id: "nls_keep" });
      await expect(removeSubscriber(t.db, "nls_gone")).resolves.toBeUndefined();
      expect(await ids()).toEqual(["nls_keep"]);
    });
  });

  describe("purgeStalePending", () => {
    it("deletes pending rows that can no longer confirm, and keeps everything else", async () => {
      // Public signup, link expired.
      await add({ id: "nls_expired", status: "pending", confirmExpiresAt: ago(DAY) });
      // Public re-signup on an old row: old created_at, link still valid.
      await add({
        id: "nls_resignup",
        status: "pending",
        createdAt: ago(90 * DAY),
        confirmExpiresAt: new Date(Date.now() + DAY),
      });
      // Registration rows carry no link: judged by age.
      await add({ id: "nls_reg_old", status: "pending", createdAt: ago(STALE_PENDING_MS + DAY) });
      await add({ id: "nls_reg_new", status: "pending", createdAt: ago(DAY) });
      // Not pending at all.
      await add({ id: "nls_subscribed", createdAt: ago(90 * DAY) });
      await add({ id: "nls_unsub", status: "unsubscribed", confirmExpiresAt: ago(DAY) });

      expect(await purgeStalePending(t.db)).toBe(2);
      expect(await ids()).toEqual(["nls_reg_new", "nls_resignup", "nls_subscribed", "nls_unsub"]);
    });

    it("returns zero when there is nothing to clean up", async () => {
      await add({ id: "nls_subscribed" });
      expect(await purgeStalePending(t.db)).toBe(0);
    });
  });
});
