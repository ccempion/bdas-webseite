import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus, type AnyEvent } from "@bdas/events";

import type { AlreadySubscribed, ConfirmationRequested } from "../events";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { subscribePublicly } from "./subscribe";

const reachable = await dbReachable();

describe.skipIf(!reachable)("subscribePublicly", () => {
  let t: TestDb;
  let seen: AnyEvent[];

  beforeEach(async () => {
    t = await setupNewsletterDb();
    resetEventBus();
    seen = [];
    getEventBus().subscribe("newsletter.confirmation_requested", (e) => {
      seen.push(e);
    });
    getEventBus().subscribe("newsletter.already_subscribed", (e) => {
      seen.push(e);
    });
  });
  afterEach(async () => {
    await t.cleanup();
  });

  const rows = async () =>
    t.client.unsafe(`SELECT id, email, status, confirm_token_hash FROM newsletter_subscribers`);

  /** Ages the per-address window out so the next call is not throttled. */
  const bypassThrottle = async () =>
    t.client.unsafe(`UPDATE newsletter_rate_limits SET expires_at = now() - interval '1 second'`);

  it("creates a pending row, logs the consent and asks for a confirmation mail", async () => {
    await subscribePublicly(t.db, {
      email: "  Neu@Example.ORG ",
      source: "footer",
      sourcePath: "/",
      context: { ip: "203.0.113.9", siteUrl: "https://bdas.de" },
    });

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!["email"]).toBe("neu@example.org");
    expect(all[0]!["status"]).toBe("pending");
    expect(all[0]!["confirm_token_hash"]).toMatch(/^[0-9a-f]{64}$/);

    expect(seen).toHaveLength(1);
    const evt = seen[0] as ConfirmationRequested;
    expect(evt.type).toBe("newsletter.confirmation_requested");
    expect(evt.email).toBe("neu@example.org");
    expect(evt.confirmUrl).toBe(`https://bdas.de/newsletter/bestaetigen?token=${evt.token}`);
    // The plaintext token is never what is stored.
    expect(all[0]!["confirm_token_hash"]).not.toBe(evt.token);

    const log = await t.client.unsafe(`SELECT event FROM newsletter_consent_log`);
    expect(log.map((r) => r["event"])).toEqual(["subscribed"]);
  });

  it("re-issues the token for a pending address instead of adding a row", async () => {
    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });
    const first = (await rows())[0]!["confirm_token_hash"];
    await bypassThrottle();

    await subscribePublicly(t.db, { email: "a@example.org", source: "landingpage" });
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!["confirm_token_hash"]).not.toBe(first);
    expect(seen).toHaveLength(2);
  });

  it("answers an already-subscribed address with already_subscribed only", async () => {
    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });
    await t.client.unsafe(
      `UPDATE newsletter_subscribers SET status='subscribed', confirmed_at=now(),
       confirm_token_hash=NULL`,
    );
    await bypassThrottle();
    seen = [];

    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });

    expect(seen).toHaveLength(1);
    expect((seen[0] as AlreadySubscribed).type).toBe("newsletter.already_subscribed");
    const all = await rows();
    expect(all[0]!["status"]).toBe("subscribed");
    expect(all[0]!["confirm_token_hash"]).toBeNull();
  });

  it("treats a return after unsubscribing as a fresh consent", async () => {
    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });
    await t.client.unsafe(
      `UPDATE newsletter_subscribers SET status='unsubscribed', unsubscribed_at=now()`,
    );
    await bypassThrottle();

    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });

    const all = await rows();
    expect(all[0]!["status"]).toBe("pending");
    const log = await t.client.unsafe(
      `SELECT event FROM newsletter_consent_log ORDER BY occurred_at`,
    );
    expect(log.map((r) => r["event"])).toEqual(["subscribed", "resubscribed"]);
  });

  it("suppresses the second mail inside 15 minutes but still answers normally", async () => {
    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });
    seen = [];
    await expect(
      subscribePublicly(t.db, { email: "a@example.org", source: "footer" }),
    ).resolves.toBeUndefined();
    expect(seen).toHaveLength(0);
  });

  it("stops the sixth signup from one IP within the hour, silently", async () => {
    const ctx = { ip: "203.0.113.55" };
    for (let i = 1; i <= 5; i += 1) {
      await subscribePublicly(t.db, {
        email: `mensch${i}@example.org`,
        source: "footer",
        context: ctx,
      });
    }
    expect(await rows()).toHaveLength(5);

    // The sixth is refused — but the caller cannot tell (spec §8 no. 4).
    await expect(
      subscribePublicly(t.db, { email: "mensch6@example.org", source: "footer", context: ctx }),
    ).resolves.toBeUndefined();
    expect(await rows()).toHaveLength(5);
  });

  it("counts the IP budget across addresses, and leaves other IPs alone", async () => {
    // Five different addresses from one IP exhaust the budget even though each
    // address is seen for the first time — that is the point of the IP cap.
    for (let i = 1; i <= 6; i += 1) {
      await subscribePublicly(t.db, {
        email: `a${i}@example.org`,
        source: "footer",
        context: { ip: "203.0.113.99" },
      });
    }
    expect(await rows()).toHaveLength(5);

    await subscribePublicly(t.db, {
      email: "anders@example.org",
      source: "footer",
      context: { ip: "198.51.100.1" },
    });
    expect(await rows()).toHaveLength(6);
  });

  it("does not apply the IP cap when no IP is known", async () => {
    // A server-side caller may have no IP at all; refusing everything then
    // would break the path rather than protect it.
    for (let i = 1; i <= 7; i += 1) {
      await subscribePublicly(t.db, { email: `ohne${i}@example.org`, source: "footer" });
    }
    expect(await rows()).toHaveLength(7);
  });

  it("refuses over-budget attempts before touching the subscriber table", async () => {
    const ctx = { ip: "203.0.113.77" };
    for (let i = 1; i <= 5; i += 1) {
      await subscribePublicly(t.db, { email: `b${i}@example.org`, source: "footer", context: ctx });
    }
    // An address that already exists must not be touched either once the IP is
    // over budget — otherwise the cap would still leak "this address is known"
    // through a changed token.
    const before = await t.client.unsafe(
      `SELECT confirm_token_hash FROM newsletter_subscribers WHERE email = 'b1@example.org'`,
    );
    await subscribePublicly(t.db, { email: "b1@example.org", source: "footer", context: ctx });
    const after = await t.client.unsafe(
      `SELECT confirm_token_hash FROM newsletter_subscribers WHERE email = 'b1@example.org'`,
    );
    expect(after[0]!["confirm_token_hash"]).toBe(before[0]!["confirm_token_hash"]);
  });

  it("rejects an address that is not one", async () => {
    await expect(
      subscribePublicly(t.db, { email: "keine-adresse", source: "footer" }),
    ).rejects.toThrow();
    expect(await rows()).toHaveLength(0);
  });
});
