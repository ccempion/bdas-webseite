import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { setAccountEmailResolver } from "../resolver";
import { newsletterConsentLog, newsletterPrompts, newsletterSubscribers } from "../schema";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { declineForUser, MAX_DISMISSALS, PROMPT_INTERVAL_MS, shouldPrompt } from "./prompts";

const reachable = await dbReachable();

describe.skipIf(!reachable)("newsletter prompts", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupNewsletterDb();
    setAccountEmailResolver({
      async resolve(_db, ids) {
        return new Map(ids.map((id) => [id, `${id}@example.org`]));
      },
    });
  });
  afterEach(async () => {
    await t.cleanup();
  });

  /** The account shape the prompt reader now takes: id and address. */
  const acc = (userId: string) => ({ userId, email: `${userId}@example.org` });

  it("prompts an account that has never answered", async () => {
    expect(await shouldPrompt(t.db, acc("u1"))).toBe(true);
  });

  it("stays quiet for the fortnight after a dismissal", async () => {
    await declineForUser(t.db, { userId: "u1" });
    expect(await shouldPrompt(t.db, acc("u1"))).toBe(false);
  });

  it("asks again once the fortnight is over", async () => {
    await declineForUser(t.db, { userId: "u1" });
    await t.db
      .update(newsletterPrompts)
      .set({ lastDismissedAt: new Date(Date.now() - PROMPT_INTERVAL_MS - 1000) });
    expect(await shouldPrompt(t.db, acc("u1"))).toBe(true);
  });

  it("goes quiet for good after three dismissals and records `declined`", async () => {
    for (let i = 0; i < MAX_DISMISSALS; i += 1) await declineForUser(t.db, { userId: "u1" });

    const [row] = await t.db.select().from(newsletterSubscribers);
    expect(row?.status).toBe("declined");
    expect(row?.userId).toBe("u1");
    expect(row?.email).toBe("u1@example.org");

    const log = await t.db.select().from(newsletterConsentLog);
    expect(log.map((l) => l.event)).toEqual(["declined"]);

    // Not a re-prompt candidate even after the interval elapses.
    await t.db.update(newsletterPrompts).set({ lastDismissedAt: new Date(0) });
    expect(await shouldPrompt(t.db, acc("u1"))).toBe(false);
  });

  it("never overwrites an existing answer with `declined`", async () => {
    await t.db.insert(newsletterSubscribers).values({
      id: "nls_1",
      email: "u1@example.org",
      userId: "u1",
      status: "unsubscribed",
      unsubscribeTokenHash: "h1",
      source: "konto",
    });
    for (let i = 0; i < MAX_DISMISSALS; i += 1) await declineForUser(t.db, { userId: "u1" });

    const rows = await t.db.select().from(newsletterSubscribers);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("unsubscribed");
  });

  it("does not prompt anyone who already has a row, whatever its status", async () => {
    for (const status of ["pending", "subscribed", "unsubscribed", "declined"] as const) {
      const userId = `u_${status}`;
      await t.db.insert(newsletterSubscribers).values({
        id: `nls_${status}`,
        email: `${status}@example.org`,
        userId,
        status,
        unsubscribeTokenHash: `h_${status}`,
        source: "konto",
      });
      expect(await shouldPrompt(t.db, acc(userId))).toBe(false);
    }
  });

  it("falls back to a synthetic key when the account address is unresolvable", async () => {
    setAccountEmailResolver({
      async resolve() {
        return new Map();
      },
    });
    for (let i = 0; i < MAX_DISMISSALS; i += 1) await declineForUser(t.db, { userId: "u9" });
    const [row] = await t.db.select().from(newsletterSubscribers);
    expect(row?.email).toBe("user:u9");
  });
  it("stays quiet when only the address is on the list, not the id", async () => {
    // Signed up through a public form after the account was verified: the row
    // carries the address and no user id. Asking again would be asking someone
    // who has already answered.
    await t.db.insert(newsletterSubscribers).values({
      id: "nls_orphan",
      email: "u9@example.org",
      status: "subscribed",
      unsubscribeTokenHash: "h_orphan",
      source: "footer",
    });
    expect(await shouldPrompt(t.db, acc("u9"))).toBe(false);
  });
});
