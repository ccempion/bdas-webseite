import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { NotFoundError } from "@bdas/errors";
import { resetEventBus } from "@bdas/events";

import { setAccountEmailResolver } from "../resolver";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { hashToken } from "../tokens";
import { confirmSubscription, unsubscribeAsUser, unsubscribeByToken } from "./confirm";
import { getSubscriptionForUser } from "./read";
import { subscribeAsUser } from "./subscribe";

const reachable = await dbReachable();

describe.skipIf(!reachable)("confirm and unsubscribe", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupNewsletterDb();
    resetEventBus();
    setAccountEmailResolver({
      async resolve(_db, ids) {
        return new Map(ids.map((id) => [id, `${id}@example.org`]));
      },
    });
  });
  afterEach(async () => {
    await t.cleanup();
  });

  /** A pending row with known plaintext tokens, without going through the
   *  public path (which throttles and publishes). */
  async function seedPending(over: { confirmExpires?: string } = {}): Promise<void> {
    await t.client.unsafe(
      `INSERT INTO newsletter_subscribers
         (id, email, status, confirm_token_hash, confirm_expires_at,
          unsubscribe_token_hash, source)
       VALUES ('nls_1', 'a@example.org', 'pending', '${hashToken("conf")}',
               ${over.confirmExpires ?? "now() + interval '7 days'"},
               '${hashToken("unsub")}', 'footer')`,
    );
  }

  it("confirms a pending row and logs it", async () => {
    await seedPending();
    const res = await confirmSubscription(t.db, "conf", { ip: "203.0.113.4" });
    expect(res.status).toBe("confirmed");

    const [row] = await t.client.unsafe(`SELECT status, confirmed_at FROM newsletter_subscribers`);
    expect(row!["status"]).toBe("subscribed");
    expect(row!["confirmed_at"]).not.toBeNull();

    const log = await t.client.unsafe(`SELECT event, ip FROM newsletter_consent_log`);
    expect(log[0]!["event"]).toBe("confirmed");
    expect(log[0]!["ip"]).toBe("203.0.113.4");
  });

  it("greets a second click instead of failing, and does not log twice", async () => {
    await seedPending();
    await confirmSubscription(t.db, "conf");
    const again = await confirmSubscription(t.db, "conf");
    expect(again.status).toBe("already_confirmed");
    const log = await t.client.unsafe(`SELECT count(*)::int AS n FROM newsletter_consent_log`);
    expect(log[0]!["n"]).toBe(1);
  });

  it("reports an expired link as expired and leaves the row pending", async () => {
    await seedPending({ confirmExpires: "now() - interval '1 second'" });
    expect((await confirmSubscription(t.db, "conf")).status).toBe("expired");
    const [row] = await t.client.unsafe(`SELECT status FROM newsletter_subscribers`);
    expect(row!["status"]).toBe("pending");
  });

  it("reports an unknown token as expired — the two are indistinguishable", async () => {
    expect((await confirmSubscription(t.db, "wer-weiss")).status).toBe("expired");
  });

  it("unsubscribes by token, idempotently, and kills the confirmation link", async () => {
    await seedPending();
    await confirmSubscription(t.db, "conf");

    await unsubscribeByToken(t.db, "unsub");
    const [row] = await t.client.unsafe(
      `SELECT status, unsubscribed_at, confirm_token_hash FROM newsletter_subscribers`,
    );
    expect(row!["status"]).toBe("unsubscribed");
    expect(row!["unsubscribed_at"]).not.toBeNull();
    expect(row!["confirm_token_hash"]).toBeNull();

    // A stale confirmation link must not resurrect the subscription.
    expect((await confirmSubscription(t.db, "conf")).status).toBe("expired");
    // Clicking unsubscribe twice is normal and must stay quiet.
    await expect(unsubscribeByToken(t.db, "unsub")).resolves.toBeUndefined();
  });

  it("rejects an unknown unsubscribe token", async () => {
    await expect(unsubscribeByToken(t.db, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("unsubscribes an account and logs it", async () => {
    await subscribeAsUser(t.db, { userId: "u1", source: "konto" });
    await unsubscribeAsUser(t.db, { userId: "u1" });

    const sub = await getSubscriptionForUser(t.db, "u1");
    expect(sub!.status).toBe("unsubscribed");
    const log = await t.client.unsafe(
      `SELECT event FROM newsletter_consent_log ORDER BY occurred_at`,
    );
    expect(log.map((r) => r["event"])).toEqual(["subscribed", "unsubscribed"]);
  });

  it("stays quiet when an account with no subscription unsubscribes", async () => {
    await expect(unsubscribeAsUser(t.db, { userId: "ghost" })).resolves.toBeUndefined();
  });
});
