/**
 * changePassword integration test — real Postgres per CLAUDE.md §4.
 * Skipped when DATABASE_URL is unreachable, like index.test.ts.
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

import { authCredentials, authSessions } from "../schema";
import { register } from "./register";
import { verifyEmail } from "./verify";
import { login } from "./login";
import { getCurrentUser } from "./me";
import { changePassword } from "./password-change";

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

const OLD = "Korrekt-Pferd-9!";
const NEW = "Anderes-Pferd-42!";

describeIfDb("changePassword", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of ["0001_init.sql", "0002_consent.sql"]) {
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
      { email, password: OLD, consent: true },
      {
        ip: "1.1.1.1",
        publicSiteUrl: "https://bdas.de",
      },
    );
    await verifyEmail(t.db, reg.verifyToken);
    const session = await login(t.db, { email, password: OLD }, { ip: "1.1.1.1" });
    return { email, ...session, userId: reg.userId };
  }

  it("rotates the hash: the old password stops working, the new one starts", async () => {
    const u = await signedInUser();

    const res = await changePassword(
      t.db,
      { currentPassword: OLD, newPassword: NEW },
      { userId: u.userId },
    );
    expect(res.userId).toBe(u.userId);

    await expect(
      login(t.db, { email: u.email, password: OLD }, { ip: "1.1.1.1" }),
    ).rejects.toThrow();
    const relogin = await login(t.db, { email: u.email, password: NEW }, { ip: "1.1.1.1" });
    expect(relogin.sessionId).toMatch(/^ses_/);
  });

  it("rejects a wrong current password and leaves the hash untouched", async () => {
    const u = await signedInUser();
    const before = await t.db
      .select({ h: authCredentials.hashedPassword })
      .from(authCredentials)
      .where(eq(authCredentials.userId, u.userId));

    await expect(
      changePassword(
        t.db,
        { currentPassword: "Falsch-Falsch-1!", newPassword: NEW },
        { userId: u.userId },
      ),
    ).rejects.toThrow("Aktuelles Passwort ist falsch.");

    const after = await t.db
      .select({ h: authCredentials.hashedPassword })
      .from(authCredentials)
      .where(eq(authCredentials.userId, u.userId));
    expect(after[0]?.h).toBe(before[0]?.h);
  });

  it("rejects a new password that fails the policy", async () => {
    const u = await signedInUser();
    await expect(
      changePassword(t.db, { currentPassword: OLD, newPassword: "kurz" }, { userId: u.userId }),
    ).rejects.toThrow(/mindestens 8 Zeichen/);
  });

  it("rejects a new password identical to the current one", async () => {
    const u = await signedInUser();
    await expect(
      changePassword(t.db, { currentPassword: OLD, newPassword: OLD }, { userId: u.userId }),
    ).rejects.toThrow("Das neue Passwort muss sich vom aktuellen unterscheiden.");
  });

  it("revokes every prior session, the calling one included, and issues a fresh one", async () => {
    const u = await signedInUser();
    // Two more devices for the same user.
    const phone = await login(t.db, { email: u.email, password: OLD }, { ip: "2.2.2.2" });
    const tablet = await login(t.db, { email: u.email, password: OLD }, { ip: "3.3.3.3" });

    const res = await changePassword(
      t.db,
      { currentPassword: OLD, newPassword: NEW },
      { userId: u.userId },
    );

    // The calling cookie dies with the rest: a stolen copy carries the same
    // jti, so sparing the caller would spare the copy.
    expect(await getCurrentUser(t.db, u.token)).toBeNull();
    expect(await getCurrentUser(t.db, phone.token)).toBeNull();
    expect(await getCurrentUser(t.db, tablet.token)).toBeNull();

    // …and the returned token is what keeps the caller signed in.
    expect(res.sessionId).not.toBe(u.sessionId);
    const me = await getCurrentUser(t.db, res.token);
    expect(me?.id).toBe(u.userId);
    expect(me?.sessionId).toBe(res.sessionId);

    const rows = await t.db
      .select({ id: authSessions.id, revokedAt: authSessions.revokedAt })
      .from(authSessions)
      .where(eq(authSessions.userId, u.userId));
    expect(rows.filter((r) => r.revokedAt === null).map((r) => r.id)).toEqual([res.sessionId]);
    expect(rows.filter((r) => r.revokedAt !== null)).toHaveLength(3);
  });

  it("rate limits after 5 attempts in the window", async () => {
    const u = await signedInUser();
    const ctx = { userId: u.userId };
    for (let i = 0; i < 5; i += 1) {
      await expect(
        changePassword(t.db, { currentPassword: "Falsch-Falsch-1!", newPassword: NEW }, ctx),
      ).rejects.toThrow("Aktuelles Passwort ist falsch.");
    }
    await expect(
      changePassword(t.db, { currentPassword: OLD, newPassword: NEW }, ctx),
    ).rejects.toThrow(/Zu viele Versuche/);
  });

  it("publishes auth.password.changed", async () => {
    const u = await signedInUser();
    const seen: Array<{ userId: string }> = [];
    getEventBus().subscribe<{ type: "auth.password.changed"; userId: string; at: Date }>(
      "auth.password.changed",
      (e) => {
        seen.push({ userId: e.userId });
      },
    );

    await changePassword(t.db, { currentPassword: OLD, newPassword: NEW }, { userId: u.userId });

    expect(seen).toEqual([{ userId: u.userId }]);
  });
});
