/**
 * requestAccountDeletion / cancelAccountDeletion integration test — real
 * Postgres per CLAUDE.md §4. Skipped when DATABASE_URL is unreachable, like
 * delete-account.test.ts.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import type { AccountDeletionCancelled, AccountDeletionRequested } from "../events";
import { accountDeletionRequests, authSessions, authUsers } from "../schema";
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  buildReactivationUrl,
  cancelAccountDeletion,
  getDeletionRequestForUser,
  requestAccountDeletion,
} from "./account-deletion-request";
import { login } from "./login";
import { register } from "./register";
import { verifyEmail } from "./verify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

async function dbReachable(): Promise<boolean> {
  const url = process.env["DATABASE_URL"] ?? DEFAULT_URL;
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 2 });
  try {
    await sql`select 1`;
    await sql.end();
    return true;
  } catch {
    try {
      await sql.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

describeIfDb("requestAccountDeletion / cancelAccountDeletion", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      "0001_init.sql",
      "0002_consent.sql",
      "0003_email_change.sql",
      "0004_account_deletion.sql",
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  const signUpAndLogin = async (email: string, ip: string) => {
    const reg = await register(
      t.db,
      { email, password: "Verysecret!23", consent: true },
      { ip, publicSiteUrl: "https://bdas.de" },
    );
    await verifyEmail(t.db, reg.verifyToken);
    await login(t.db, { email, password: "Verysecret!23" }, { ip });
    return reg;
  };

  describe("requestAccountDeletion", () => {
    it("locks the account, revokes sessions, and schedules a purge ~30 days out", async () => {
      const reg = await signUpAndLogin("anna@example.de", "1.1.1.1");
      const before = Date.now();

      const result = await requestAccountDeletion(t.db, {
        userId: reg.userId,
        displayName: "Anna Test",
      });

      const expectedMs = ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
      expect(result.scheduledPurgeAt.getTime() - before).toBeGreaterThan(expectedMs - 5000);
      expect(result.scheduledPurgeAt.getTime() - before).toBeLessThan(expectedMs + 5000);
      expect(result.reactivationToken.length).toBeGreaterThan(20);

      const [user] = await t.db.select().from(authUsers).where(eq(authUsers.id, reg.userId));
      expect(user?.status).toBe("pending_deletion");

      const sessions = await t.db
        .select()
        .from(authSessions)
        .where(eq(authSessions.userId, reg.userId));
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);

      const stored = await getDeletionRequestForUser(t.db, reg.userId);
      expect(stored?.emailSnapshot).toBe("anna@example.de");
      expect(stored?.nameSnapshot).toBe("Anna Test");
      expect(stored?.status).toBe("pending");
    });

    it("publishes auth.account_deletion.requested", async () => {
      const published: AccountDeletionRequested[] = [];
      getEventBus().subscribe<AccountDeletionRequested>(
        "auth.account_deletion.requested",
        async (e) => {
          published.push(e);
        },
      );
      const reg = await signUpAndLogin("bob@example.de", "2.2.2.2");

      await requestAccountDeletion(t.db, { userId: reg.userId, displayName: "Bob Test" });

      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({
        type: "auth.account_deletion.requested",
        userId: reg.userId,
      });
    });

    it("rejects login for a pending-deletion account with a distinct message", async () => {
      const reg = await signUpAndLogin("carla@example.de", "3.3.3.3");
      await requestAccountDeletion(t.db, { userId: reg.userId, displayName: "Carla Test" });

      await expect(
        login(t.db, { email: "carla@example.de", password: "Verysecret!23" }, { ip: "3.3.3.3" }),
      ).rejects.toThrow(/Löschung vorgemerkt/);
    });

    it("throws when a deletion is already pending for this user", async () => {
      const reg = await signUpAndLogin("duplicate@example.de", "4.4.4.4");
      await requestAccountDeletion(t.db, { userId: reg.userId, displayName: "Erste Anfrage" });

      await expect(
        requestAccountDeletion(t.db, { userId: reg.userId, displayName: "Zweite Anfrage" }),
      ).rejects.toThrow(/bereits eine Löschung/);
    });

    it("throws NotFoundError for an unknown user", async () => {
      await expect(
        requestAccountDeletion(t.db, { userId: "usr_does_not_exist", displayName: "x" }),
      ).rejects.toThrow(/Konto nicht gefunden/);
    });

    it("rejects a non-active account (e.g. still unverified)", async () => {
      const reg = await register(
        t.db,
        { email: "ines@example.de", password: "Verysecret!23", consent: true },
        { ip: "10.10.10.10", publicSiteUrl: "https://bdas.de" },
      );

      await expect(
        requestAccountDeletion(t.db, { userId: reg.userId, displayName: "Ines Test" }),
      ).rejects.toThrow(/nicht aktiv/);
    });

    it("allows only one pending deletion per user when two requests race", async () => {
      const reg = await signUpAndLogin("helga@example.de", "9.9.9.9");

      const results = await Promise.allSettled([
        requestAccountDeletion(t.db, { userId: reg.userId, displayName: "Helga Eins" }),
        requestAccountDeletion(t.db, { userId: reg.userId, displayName: "Helga Zwei" }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
        /bereits eine Löschung/,
      );
    });
  });

  describe("cancelAccountDeletion", () => {
    it("reactivates the account and allows login again", async () => {
      const reg = await signUpAndLogin("dora@example.de", "5.5.5.5");
      const { reactivationToken } = await requestAccountDeletion(t.db, {
        userId: reg.userId,
        displayName: "Dora Test",
      });

      const result = await cancelAccountDeletion(t.db, reactivationToken);
      expect(result.userId).toBe(reg.userId);

      const [user] = await t.db.select().from(authUsers).where(eq(authUsers.id, reg.userId));
      expect(user?.status).toBe("active");

      const login2 = await login(
        t.db,
        { email: "dora@example.de", password: "Verysecret!23" },
        { ip: "5.5.5.5" },
      );
      expect(login2.userId).toBe(reg.userId);

      expect(await getDeletionRequestForUser(t.db, reg.userId)).toBeNull();
    });

    it("publishes auth.account_deletion.cancelled", async () => {
      const published: AccountDeletionCancelled[] = [];
      getEventBus().subscribe<AccountDeletionCancelled>(
        "auth.account_deletion.cancelled",
        async (e) => {
          published.push(e);
        },
      );
      const reg = await signUpAndLogin("eva@example.de", "6.6.6.6");
      const { reactivationToken } = await requestAccountDeletion(t.db, {
        userId: reg.userId,
        displayName: "Eva Test",
      });

      await cancelAccountDeletion(t.db, reactivationToken);

      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({
        type: "auth.account_deletion.cancelled",
        userId: reg.userId,
      });
    });

    it("throws for an unknown or already-used token", async () => {
      const reg = await signUpAndLogin("finn@example.de", "7.7.7.7");
      const { reactivationToken } = await requestAccountDeletion(t.db, {
        userId: reg.userId,
        displayName: "Finn Test",
      });
      await cancelAccountDeletion(t.db, reactivationToken);

      await expect(cancelAccountDeletion(t.db, reactivationToken)).rejects.toThrow(
        /ungültig oder bereits verwendet/,
      );
    });

    it("throws for an expired token", async () => {
      const reg = await signUpAndLogin("gina@example.de", "8.8.8.8");
      const { reactivationToken } = await requestAccountDeletion(t.db, {
        userId: reg.userId,
        displayName: "Gina Test",
      });
      await t.db
        .update(accountDeletionRequests)
        .set({ reactivationExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(accountDeletionRequests.userId, reg.userId));

      await expect(cancelAccountDeletion(t.db, reactivationToken)).rejects.toThrow(/abgelaufen/);
    });

    it("allows only one cancel to succeed when two cancels race", async () => {
      const reg = await signUpAndLogin("iris@example.de", "11.11.11.11");
      const { reactivationToken } = await requestAccountDeletion(t.db, {
        userId: reg.userId,
        displayName: "Iris Test",
      });

      const results = await Promise.allSettled([
        cancelAccountDeletion(t.db, reactivationToken),
        cancelAccountDeletion(t.db, reactivationToken),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
        /ungültig oder bereits verwendet/,
      );
    });
  });
});

describe("buildReactivationUrl", () => {
  it("builds a URL-encoded reactivation link", () => {
    expect(buildReactivationUrl("https://bdas.de/", "abc123")).toBe(
      "https://bdas.de/konto-reaktivieren/abc123",
    );
  });
});
