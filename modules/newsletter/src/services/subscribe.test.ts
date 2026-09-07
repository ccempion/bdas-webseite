import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { setAccountEmailResolver } from "../resolver";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { getSubscriptionForUser } from "./read";
import { subscribeAsUser } from "./subscribe";

const reachable = await dbReachable();

describe.skipIf(!reachable)("subscribeAsUser", () => {
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

  const log = async () =>
    t.client.unsafe(`SELECT event, ip, source FROM newsletter_consent_log ORDER BY occurred_at`);

  it("subscribes a logged-in account straight to `subscribed` with no mail", async () => {
    const sub = await subscribeAsUser(t.db, {
      userId: "u1",
      source: "konto",
      sourcePath: "/account/einstellungen",
      context: { ip: "203.0.113.7", userAgent: "Firefox" },
    });

    expect(sub.status).toBe("subscribed");
    expect(sub.userId).toBe("u1");
    expect(sub.email).toBe("u1@example.org");
    expect(sub.confirmedAt).not.toBeNull();

    const rows = await log();
    expect(rows).toHaveLength(1);
    expect(rows[0]!["event"]).toBe("subscribed");
    expect(rows[0]!["ip"]).toBe("203.0.113.7");
    expect(rows[0]!["source"]).toBe("konto");
  });

  it("is idempotent: a second click neither duplicates the row nor the log", async () => {
    const first = await subscribeAsUser(t.db, { userId: "u1", source: "konto" });
    const second = await subscribeAsUser(t.db, { userId: "u1", source: "dashboard_hinweis" });
    expect(second.id).toBe(first.id);
    expect(await log()).toHaveLength(1);
  });

  it("revives an unsubscribed account and logs it as a fresh consent", async () => {
    const sub = await subscribeAsUser(t.db, { userId: "u1", source: "konto" });
    await t.client.unsafe(
      `UPDATE newsletter_subscribers SET status='unsubscribed', unsubscribed_at=now()
       WHERE id='${sub.id}'`,
    );

    const again = await subscribeAsUser(t.db, { userId: "u1", source: "konto" });
    expect(again.id).toBe(sub.id);
    expect(again.status).toBe("subscribed");
    expect(again.unsubscribedAt).toBeNull();

    const rows = await log();
    expect(rows.map((r) => r["event"])).toEqual(["subscribed", "resubscribed"]);
  });

  it("adopts an anonymous row that already holds the account address", async () => {
    await t.client.unsafe(
      `INSERT INTO newsletter_subscribers (id, email, status, unsubscribe_token_hash, source)
       VALUES ('nls_anon', 'u1@example.org', 'pending', 'h_anon', 'footer')`,
    );

    const sub = await subscribeAsUser(t.db, { userId: "u1", source: "konto" });
    expect(sub.id).toBe("nls_anon");
    expect(sub.userId).toBe("u1");
    expect(sub.status).toBe("subscribed");

    const all = await t.client.unsafe(`SELECT count(*)::int AS n FROM newsletter_subscribers`);
    expect(all[0]!["n"]).toBe(1);
  });

  it("still subscribes when the resolver cannot name the address", async () => {
    setAccountEmailResolver({
      async resolve() {
        return new Map();
      },
    });
    const sub = await subscribeAsUser(t.db, { userId: "u9", source: "konto" });
    expect(sub.status).toBe("subscribed");
    // A synthetic key keeps the NOT NULL/UNIQUE contract without inventing
    // an address that could collide with a real one.
    expect(sub.email).toBe("user:u9");
    expect(await getSubscriptionForUser(t.db, "u9")).not.toBeNull();
  });
});
