import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { NotFoundError } from "@bdas/errors";
import { resetEventBus } from "@bdas/events";

import { setAccountEmailResolver } from "../resolver";
import { newsletterSubscribers } from "../schema";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { hashToken } from "../tokens";
import {
  confirmSubscription,
  peekUnsubscribeToken,
  unsubscribeAsUser,
  unsubscribeByToken,
} from "./confirm";
import { getSubscriptionForAccount } from "./read";
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
    await unsubscribeAsUser(t.db, { userId: "u1", email: "u1@example.org" });

    const sub = await getSubscriptionForAccount(t.db, { userId: "u1", email: "u1@example.org" });
    expect(sub!.status).toBe("unsubscribed");
    const log = await t.client.unsafe(
      `SELECT event FROM newsletter_consent_log ORDER BY occurred_at`,
    );
    expect(log.map((r) => r["event"])).toEqual(["subscribed", "unsubscribed"]);
  });

  it("stays quiet when an account with no subscription unsubscribes", async () => {
    await expect(
      unsubscribeAsUser(t.db, { userId: "ghost", email: "ghost@example.org" }),
    ).resolves.toBeUndefined();
  });
  it("peeks at a valid unsubscribe token without changing anything", async () => {
    await seedPending();
    await confirmSubscription(t.db, "conf");

    const peek = await peekUnsubscribeToken(t.db, "unsub");
    expect(peek).toEqual({ email: "a@example.org", alreadyUnsubscribed: false });

    // Nothing changed — peeking is not unsubscribing.
    const [row] = await t.client.unsafe(`SELECT status FROM newsletter_subscribers`);
    expect(row!["status"]).toBe("subscribed");
  });

  it("reports an already-unsubscribed row so the page can say so", async () => {
    await seedPending();
    await confirmSubscription(t.db, "conf");
    await unsubscribeByToken(t.db, "unsub");

    expect(await peekUnsubscribeToken(t.db, "unsub")).toEqual({
      email: "a@example.org",
      alreadyUnsubscribed: true,
    });
  });

  it("returns null for an unknown token", async () => {
    expect(await peekUnsubscribeToken(t.db, "gibtsnicht")).toBeNull();
  });
  it("ends and adopts an anonymous row that carries the account's address", async () => {
    // Without this, someone who signed up through a public form after their
    // account was verified could not switch the newsletter off at all: the
    // switch never saw their row.
    await t.db.insert(newsletterSubscribers).values({
      id: "nls_orphan",
      email: "u7@example.org",
      status: "subscribed",
      unsubscribeTokenHash: "h_orphan",
      source: "footer",
    });

    await unsubscribeAsUser(t.db, { userId: "u7", email: "U7@Example.org" });

    const [row] = await t.client.unsafe(
      `SELECT status, user_id FROM newsletter_subscribers WHERE id = 'nls_orphan'`,
    );
    expect(row!["status"]).toBe("unsubscribed");
    // Ending it is also the moment to attach it, so the account and the row
    // stop disagreeing about who owns the address.
    expect(row!["user_id"]).toBe("u7");
  });
});
