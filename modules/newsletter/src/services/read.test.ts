import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { setAccountEmailResolver } from "../resolver";
import { newsletterSubscribers } from "../schema";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { countSubscribers, getSubscriptionForAccount, listSubscribers } from "./read";

const reachable = await dbReachable();

describe.skipIf(!reachable)("newsletter read services", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupNewsletterDb();
    // Default: nothing resolvable, so the stored key is used verbatim.
    setAccountEmailResolver({
      async resolve() {
        return new Map();
      },
    });
  });
  afterEach(async () => {
    await t.cleanup();
    setAccountEmailResolver({
      async resolve() {
        return new Map();
      },
    });
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

  it("returns newest first", async () => {
    await add({ id: "nls_old", createdAt: new Date("2026-01-01T00:00:00Z") });
    await add({ id: "nls_new", createdAt: new Date("2026-02-01T00:00:00Z") });
    const rows = await listSubscribers(t.db);
    expect(rows.map((r) => r.id)).toEqual(["nls_new", "nls_old"]);
  });

  it("reports the current account address, not the stored key", async () => {
    await add({ id: "nls_u", email: "old@example.org", userId: "u1" });
    setAccountEmailResolver({
      async resolve() {
        return new Map([["u1", "neu@example.org"]]);
      },
    });
    const [row] = await listSubscribers(t.db);
    expect(row?.email).toBe("neu@example.org");
    expect(row?.hasAccount).toBe(true);
  });

  it("falls back to the stored key when the account is unresolvable", async () => {
    await add({ id: "nls_u", email: "old@example.org", userId: "u1" });
    const [row] = await listSubscribers(t.db);
    expect(row?.email).toBe("old@example.org");
  });

  it("deduplicates on the resolved address, the account row wins", async () => {
    await add({ id: "nls_anon", email: "b@example.org" });
    await add({ id: "nls_acct", email: "a@example.org", userId: "u1" });
    setAccountEmailResolver({
      async resolve() {
        return new Map([["u1", "b@example.org"]]);
      },
    });
    const rows = await listSubscribers(t.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("nls_acct");
  });

  it("filters by status, source and group", async () => {
    await add({ id: "nls_a", status: "pending", source: "footer", groupId: "g1" });
    await add({ id: "nls_b", status: "subscribed", source: "konto", groupId: "g1" });
    await add({ id: "nls_c", status: "subscribed", source: "konto", groupId: "g2" });

    expect((await listSubscribers(t.db, { status: "pending" })).map((r) => r.id)).toEqual([
      "nls_a",
    ]);
    expect((await listSubscribers(t.db, { source: "konto" })).map((r) => r.id).sort()).toEqual([
      "nls_b",
      "nls_c",
    ]);
    expect((await listSubscribers(t.db, { groupId: "g2" })).map((r) => r.id)).toEqual(["nls_c"]);
  });

  it("searches the resolved address, not the stale stored one", async () => {
    await add({ id: "nls_u", email: "alt@example.org", userId: "u1" });
    setAccountEmailResolver({
      async resolve() {
        return new Map([["u1", "zeynep@example.org"]]);
      },
    });
    expect((await listSubscribers(t.db, { search: "ZEYNEP" })).map((r) => r.id)).toEqual(["nls_u"]);
    expect(await listSubscribers(t.db, { search: "alt@" })).toEqual([]);
  });

  it("counts per status over the same deduplicated set", async () => {
    await add({ id: "nls_p", status: "pending" });
    await add({ id: "nls_s1", status: "subscribed" });
    await add({ id: "nls_s2", email: "dup@example.org", status: "subscribed" });
    await add({ id: "nls_s3", email: "x@example.org", status: "subscribed", userId: "u1" });
    await add({ id: "nls_u", status: "unsubscribed" });
    await add({ id: "nls_d", status: "declined" });
    setAccountEmailResolver({
      async resolve() {
        return new Map([["u1", "dup@example.org"]]);
      },
    });

    const counts = await countSubscribers(t.db);
    // nls_s2 and nls_s3 collapse into one.
    expect(counts).toEqual({ pending: 1, subscribed: 2, unsubscribed: 1, declined: 1 });
    expect((await listSubscribers(t.db, { status: "subscribed" })).length).toBe(counts.subscribed);
  });
  describe("getSubscriptionForAccount", () => {
    it("finds the row linked to the account", async () => {
      await add({ id: "nls_linked", email: "linked@example.org", userId: "u1" });
      const sub = await getSubscriptionForAccount(t.db, {
        userId: "u1",
        email: "linked@example.org",
      });
      expect(sub?.id).toBe("nls_linked");
    });

    it("finds an anonymous row that carries the account's address", async () => {
      // The case that showed the signup form to someone already on the list:
      // signing up through a public form AFTER the account was verified
      // leaves a row that never learns the user id.
      await add({ id: "nls_orphan", email: "orphan@example.org", userId: null });
      const sub = await getSubscriptionForAccount(t.db, {
        userId: "u1",
        email: "  Orphan@Example.org  ",
      });
      expect(sub?.id).toBe("nls_orphan");
    });

    it("does not reach a row belonging to somebody else", async () => {
      await add({ id: "nls_other", email: "other@example.org", userId: "u2" });
      const sub = await getSubscriptionForAccount(t.db, {
        userId: "u1",
        email: "mine@example.org",
      });
      expect(sub).toBeNull();
    });
  });
});
