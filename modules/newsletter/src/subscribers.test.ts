import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@bdas/db";
import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import { newsletterConsentLog, newsletterSubscribers } from "./schema";
import { subscribeAtRegistration } from "./services/subscribe";
import { registerNewsletterSubscribers } from "./subscribers";
import { dbReachable, setupNewsletterDb } from "./test-db";

const reachable = await dbReachable();

const verified = (userId: string, email: string) => ({
  type: "auth.user.verified" as const,
  userId,
  email,
  at: new Date(),
});

describe.skipIf(!reachable)("newsletter bus subscribers", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupNewsletterDb();
    resetEventBus();
    registerNewsletterSubscribers(t.db);
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("lifts the pending registration row to subscribed", async () => {
    await subscribeAtRegistration(t.db, {
      userId: "u1",
      email: "Neu@Example.org",
      source: "registrierung",
    });
    await getEventBus().publish(verified("u1", "neu@example.org"));

    const [row] = await t.db.select().from(newsletterSubscribers);
    expect(row?.status).toBe("subscribed");
    expect(row?.confirmedAt).toBeInstanceOf(Date);
    expect(row?.userId).toBe("u1");

    const log = await t.db.select().from(newsletterConsentLog);
    expect(log.map((l) => l.event)).toEqual(["subscribed", "confirmed"]);
  });

  it("adopts an anonymous row for the account without changing its status", async () => {
    await t.db.insert(newsletterSubscribers).values({
      id: "nls_anon",
      email: "anon@example.org",
      status: "subscribed",
      unsubscribeTokenHash: "h1",
      source: "footer",
      confirmedAt: new Date("2026-01-01T00:00:00Z"),
    });
    await getEventBus().publish(verified("u2", "anon@example.org"));

    const [row] = await t.db.select().from(newsletterSubscribers);
    expect(row?.userId).toBe("u2");
    expect(row?.status).toBe("subscribed");
    expect(row?.confirmedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does nothing for someone who never ticked the box", async () => {
    await getEventBus().publish(verified("u3", "fremd@example.org"));
    expect(await t.db.select().from(newsletterSubscribers)).toEqual([]);
  });

  it("never lets a failure escape into the verification path", async () => {
    resetEventBus();
    const broken = {
      select() {
        throw new Error("db is down");
      },
    } as unknown as Db;
    registerNewsletterSubscribers(broken);

    await expect(getEventBus().publish(verified("u4", "x@example.org"))).resolves.toBeUndefined();
  });

  it("registers idempotently — a second call does not double-handle", async () => {
    registerNewsletterSubscribers(t.db);
    await subscribeAtRegistration(t.db, {
      userId: "u5",
      email: "einmal@example.org",
      source: "registrierung",
    });
    await getEventBus().publish(verified("u5", "einmal@example.org"));

    const log = await t.db.select().from(newsletterConsentLog);
    expect(log.filter((l) => l.event === "confirmed")).toHaveLength(1);
  });
});
