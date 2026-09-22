/**
 * deleteAccount integration test — real Postgres per CLAUDE.md §4. Skipped
 * when DATABASE_URL is unreachable, like the other service tests here.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import type { UserDeleted } from "../events";
import { authCredentials, authSessions, authUsers } from "../schema";
import { deleteAccount } from "./delete-account";
import { login } from "./login";
import { getCurrentUser } from "./me";
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

describeIfDb("deleteAccount", () => {
  let t: TestDb;
  let published: UserDeleted[];

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      "0001_init.sql",
      "0002_consent.sql",
      "0003_email_change.sql",
      "0005_verification_token_hash.sql",
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
    published = [];
    getEventBus().subscribe<UserDeleted>("auth.user.deleted", async (e) => {
      published.push(e);
    });
  });

  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  const signUp = (email: string, ip: string) =>
    register(
      t.db,
      { email, password: "Verysecret!23", consent: true },
      { ip, publicSiteUrl: "https://bdas.de" },
    );

  it("deletes the identity with its credentials and sessions, and kills the cookie", async () => {
    const reg = await signUp("Bot@Example.de", "1.1.1.1");
    await verifyEmail(t.db, reg.verifyToken);
    const lr = await login(
      t.db,
      { email: "bot@example.de", password: "Verysecret!23" },
      { ip: "1.1.1.1" },
    );

    expect(await deleteAccount(t.db, reg.userId)).toBe(true);

    expect(await t.db.select().from(authUsers).where(eq(authUsers.id, reg.userId))).toEqual([]);
    expect(
      await t.db.select().from(authCredentials).where(eq(authCredentials.userId, reg.userId)),
    ).toEqual([]);
    expect(
      await t.db.select().from(authSessions).where(eq(authSessions.userId, reg.userId)),
    ).toEqual([]);
    expect(await getCurrentUser(t.db, lr.token)).toBeNull();
  });

  it("deletes an unverified account too", async () => {
    const reg = await signUp("unverified@example.de", "2.2.2.2");
    expect(await deleteAccount(t.db, reg.userId)).toBe(true);
    expect(await t.db.select().from(authUsers)).toEqual([]);
  });

  it("publishes auth.user.deleted with the id and the normalized address", async () => {
    const reg = await signUp("Mixed.Case@Example.de", "3.3.3.3");
    await deleteAccount(t.db, reg.userId);

    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      type: "auth.user.deleted",
      userId: reg.userId,
      email: "mixed.case@example.de",
    });
  });

  it("leaves other accounts alone", async () => {
    const bot = await signUp("bot2@example.de", "4.4.4.4");
    const keep = await signUp("keep@example.de", "4.4.4.5");
    await deleteAccount(t.db, bot.userId);
    const rest = await t.db.select({ id: authUsers.id }).from(authUsers);
    expect(rest.map((r) => r.id)).toEqual([keep.userId]);
  });

  it("returns false and publishes nothing for an unknown id", async () => {
    expect(await deleteAccount(t.db, "usr_does_not_exist")).toBe(false);
    expect(published).toEqual([]);
  });
});
