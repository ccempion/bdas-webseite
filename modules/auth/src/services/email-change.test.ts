/**
 * requestEmailChange / confirmEmailChange integration test — real Postgres
 * per CLAUDE.md §4. Skipped when DATABASE_URL is unreachable, like
 * index.test.ts.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { eq } from "drizzle-orm";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import { authEmailChanges, authUsers } from "../schema";
import { register } from "./register";
import { verifyEmail } from "./verify";
import { login } from "./login";
import { getCurrentUser } from "./me";
import { confirmEmailChange, requestEmailChange } from "./email-change";

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

const PASSWORD = "Korrekt-Pferd-9!";

describeIfDb("requestEmailChange / confirmEmailChange", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of ["0001_init.sql", "0002_consent.sql", "0003_email_change.sql"]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** A verified, signed-in user. Returns the ids the service needs. */
  async function signedInUser(email = "alice@example.de") {
    const reg = await register(
      t.db,
      { email, password: PASSWORD, consent: true },
      { ip: "1.1.1.1", publicSiteUrl: "https://bdas.de" },
    );
    await verifyEmail(t.db, reg.verifyToken);
    const session = await login(t.db, { email, password: PASSWORD }, { ip: "1.1.1.1" });
    return { email, ...session, userId: reg.userId };
  }

  it("mints a pending token without touching auth_users yet", async () => {
    const u = await signedInUser();
    const res = await requestEmailChange(
      t.db,
      { currentPassword: PASSWORD, newEmail: "alice-neu@example.de" },
      { userId: u.userId },
    );
    expect(res.changeToken).toBeTruthy();

    const rows = await t.db
      .select({ email: authUsers.emailNormalized })
      .from(authUsers)
      .where(eq(authUsers.id, u.userId));
    expect(rows[0]?.email).toBe("alice@example.de");
  });

  it("rejects a wrong current password", async () => {
    const u = await signedInUser();
    await expect(
      requestEmailChange(
        t.db,
        { currentPassword: "Falsch-Falsch-1!", newEmail: "alice-neu@example.de" },
        { userId: u.userId },
      ),
    ).rejects.toThrow("Aktuelles Passwort ist falsch.");
  });

  it("rejects a no-op change to the current address", async () => {
    const u = await signedInUser();
    await expect(
      requestEmailChange(
        t.db,
        { currentPassword: PASSWORD, newEmail: "alice@example.de" },
        { userId: u.userId },
      ),
    ).rejects.toThrow("Das ist bereits deine aktuelle E-Mail-Adresse.");
  });

  it("rejects an address already registered to another account", async () => {
    const u = await signedInUser();
    await signedInUser("bob@example.de");
    await expect(
      requestEmailChange(
        t.db,
        { currentPassword: PASSWORD, newEmail: "bob@example.de" },
        { userId: u.userId },
      ),
    ).rejects.toThrow("Diese E-Mail-Adresse wird bereits verwendet.");
  });

  it("rejects an address another user already has a pending change toward", async () => {
    const u = await signedInUser();
    const bob = await signedInUser("bob@example.de");
    await requestEmailChange(
      t.db,
      { currentPassword: PASSWORD, newEmail: "geteilt@example.de" },
      { userId: bob.userId },
    );
    await expect(
      requestEmailChange(
        t.db,
        { currentPassword: PASSWORD, newEmail: "geteilt@example.de" },
        { userId: u.userId },
      ),
    ).rejects.toThrow("Diese E-Mail-Adresse wird bereits verwendet.");
  });

  it("replaces an earlier pending request from the same user", async () => {
    const u = await signedInUser();
    const first = await requestEmailChange(
      t.db,
      { currentPassword: PASSWORD, newEmail: "erste@example.de" },
      { userId: u.userId },
    );
    await requestEmailChange(
      t.db,
      { currentPassword: PASSWORD, newEmail: "zweite@example.de" },
      { userId: u.userId },
    );

    const rows = await t.db
      .select({ token: authEmailChanges.token })
      .from(authEmailChanges)
      .where(eq(authEmailChanges.userId, u.userId));
    expect(rows.map((r) => r.token)).toEqual([expect.any(String)]);
    expect(rows[0]?.token).not.toBe(first.changeToken);
  });

  it("rate limits after 5 attempts in the window", async () => {
    const u = await signedInUser();
    const ctx = { userId: u.userId };
    for (let i = 0; i < 5; i += 1) {
      await expect(
        requestEmailChange(
          t.db,
          { currentPassword: "Falsch-Falsch-1!", newEmail: "alice-neu@example.de" },
          ctx,
        ),
      ).rejects.toThrow("Aktuelles Passwort ist falsch.");
    }
    await expect(
      requestEmailChange(
        t.db,
        { currentPassword: PASSWORD, newEmail: "alice-neu@example.de" },
        ctx,
      ),
    ).rejects.toThrow(/Zu viele Versuche/);
  });

  it("confirming flips the login email and revokes every session", async () => {
    const u = await signedInUser();
    const phone = await login(t.db, { email: u.email, password: PASSWORD }, { ip: "2.2.2.2" });
    const req = await requestEmailChange(
      t.db,
      { currentPassword: PASSWORD, newEmail: "alice-neu@example.de" },
      { userId: u.userId },
    );

    const res = await confirmEmailChange(t.db, req.changeToken);
    expect(res).toEqual({
      userId: u.userId,
      oldEmail: "alice@example.de",
      newEmail: "alice-neu@example.de",
      alreadyConfirmed: false,
    });

    expect(await getCurrentUser(t.db, u.token)).toBeNull();
    expect(await getCurrentUser(t.db, phone.token)).toBeNull();

    await expect(
      login(t.db, { email: "alice@example.de", password: PASSWORD }, { ip: "1.1.1.1" }),
    ).rejects.toThrow();
    const relogin = await login(
      t.db,
      { email: "alice-neu@example.de", password: PASSWORD },
      { ip: "1.1.1.1" },
    );
    expect(relogin.userId).toBe(u.userId);
  });

  it("is idempotent when the confirm link is followed twice", async () => {
    const u = await signedInUser();
    const req = await requestEmailChange(
      t.db,
      { currentPassword: PASSWORD, newEmail: "alice-neu@example.de" },
      { userId: u.userId },
    );
    await confirmEmailChange(t.db, req.changeToken);

    const replay = await confirmEmailChange(t.db, req.changeToken);
    expect(replay.alreadyConfirmed).toBe(true);
    expect(replay.newEmail).toBe("alice-neu@example.de");
  });

  it("rejects an invalid or expired token", async () => {
    await expect(confirmEmailChange(t.db, "does-not-exist")).rejects.toThrow(
      "Bestätigungslink ungültig oder abgelaufen.",
    );
  });

  it("rejects confirmation if the address was claimed by another account meanwhile", async () => {
    const u = await signedInUser();
    const req = await requestEmailChange(
      t.db,
      { currentPassword: PASSWORD, newEmail: "spaeter-vergeben@example.de" },
      { userId: u.userId },
    );

    // A second account registers and verifies the same address before the
    // first user's link is clicked.
    await signedInUser("spaeter-vergeben@example.de");

    await expect(confirmEmailChange(t.db, req.changeToken)).rejects.toThrow(
      "Diese E-Mail-Adresse wird inzwischen bereits verwendet.",
    );
  });

  it("publishes auth.email.changed", async () => {
    const u = await signedInUser();
    const req = await requestEmailChange(
      t.db,
      { currentPassword: PASSWORD, newEmail: "alice-neu@example.de" },
      { userId: u.userId },
    );
    const seen: Array<{ userId: string; oldEmail: string; newEmail: string }> = [];
    getEventBus().subscribe<{
      type: "auth.email.changed";
      userId: string;
      oldEmail: string;
      newEmail: string;
      at: Date;
    }>("auth.email.changed", (e) => {
      seen.push({ userId: e.userId, oldEmail: e.oldEmail, newEmail: e.newEmail });
    });

    await confirmEmailChange(t.db, req.changeToken);

    expect(seen).toEqual([
      { userId: u.userId, oldEmail: "alice@example.de", newEmail: "alice-neu@example.de" },
    ]);
  });
});
