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

  it("rejects an address that is not one", async () => {
    await expect(
      subscribePublicly(t.db, { email: "keine-adresse", source: "footer" }),
    ).rejects.toThrow();
    expect(await rows()).toHaveLength(0);
  });
});
