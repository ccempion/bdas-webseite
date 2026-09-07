import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupNewsletterDb } from "./test-db";

const reachable = await dbReachable();

describe.skipIf(!reachable)("newsletter schema", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupNewsletterDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  const insert = (over: Record<string, unknown> = {}) => {
    const row = {
      id: "nls_1",
      email: "a@example.org",
      status: "pending",
      unsubscribe_token_hash: "h1",
      source: "footer",
      ...over,
    } as Record<string, string>;
    const cols = Object.keys(row);
    const vals = cols.map((c) => `'${row[c]}'`).join(",");
    return t.client.unsafe(
      `INSERT INTO newsletter_subscribers (${cols.join(",")}) VALUES (${vals})`,
    );
  };

  it("rejects a status outside the four known values", async () => {
    await expect(insert({ status: "maybe" })).rejects.toThrow();
  });

  it("rejects an unknown source", async () => {
    await expect(insert({ source: "instagram" })).rejects.toThrow();
  });

  it("rejects a duplicate email", async () => {
    await insert();
    await expect(insert({ id: "nls_2", unsubscribe_token_hash: "h2" })).rejects.toThrow();
  });

  it("allows many anonymous rows but only one row per account", async () => {
    await insert({ user_id: "u1" });
    await insert({ id: "nls_2", email: "b@example.org", unsubscribe_token_hash: "h2" });
    await expect(
      insert({ id: "nls_3", email: "c@example.org", unsubscribe_token_hash: "h3", user_id: "u1" }),
    ).rejects.toThrow();
  });

  it("cascades the consent log when a subscriber is deleted", async () => {
    await insert();
    await t.client.unsafe(
      `INSERT INTO newsletter_consent_log (id, subscriber_id, event)
       VALUES ('nlc_1', 'nls_1', 'subscribed')`,
    );
    await t.client.unsafe(`DELETE FROM newsletter_subscribers WHERE id = 'nls_1'`);
    const left = await t.client.unsafe(`SELECT count(*)::int AS n FROM newsletter_consent_log`);
    expect(left[0]!["n"]).toBe(0);
  });
});
