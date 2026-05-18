/**
 * Auth integration test — runs against a real Postgres schema (per CLAUDE.md §4).
 *
 * Each test creates an isolated schema via `createTestDb`, runs the
 * 0001_init migration into it, and exercises the service layer end-to-end.
 *
 * Skipped when DATABASE_URL is unreachable (so a fresh checkout without
 * Docker still gets `pnpm test` green; CI brings up a Postgres service).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { createTestDb, type TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { register } from "./services/register";
import { verifyEmail } from "./services/verify";
import { login } from "./services/login";
import { logout } from "./services/logout";
import { completePasswordReset, requestPasswordReset } from "./services/password-reset";
import { getCurrentUser } from "./services/me";
import { passwordSchema, PASSWORD_MIN_LENGTH } from "./password";

describe("password policy", () => {
  it("enforces min length + upper + lower + special, no digit required", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(passwordSchema.safeParse("Abc!45678").success).toBe(false); // 9 chars
    expect(passwordSchema.safeParse("abcdefghij!").success).toBe(false); // no upper
    expect(passwordSchema.safeParse("ABCDEFGHIJ!").success).toBe(false); // no lower
    expect(passwordSchema.safeParse("Abcdefghij1").success).toBe(false); // no special
    expect(passwordSchema.safeParse("Abcdefgh!j").success).toBe(true); // 10, upper+lower+special
  });
});

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

describeIfDb("auth integration", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await createTestDb();
    const sql = await fs.readFile(
      path.join(__dirname, "..", "migrations", "0001_init.sql"),
      "utf8",
    );
    await t.client.unsafe(sql);
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  afterAll(() => {
    delete process.env["BDAS_FEDERAL_BOARD_EMAILS"];
  });

  it("register → verify → login → logout happy path", async () => {
    const reg = await register(
      t.db,
      { email: "alice@example.de", password: "Verysecret!23" },
      { ip: "1.1.1.1", publicSiteUrl: "https://bdas.de" },
    );
    expect(reg.userId).toMatch(/^usr_/);
    expect(reg.verifyToken.length).toBeGreaterThan(20);

    const v = await verifyEmail(t.db, reg.verifyToken);
    expect(v.alreadyVerified).toBe(false);
    expect(v.userId).toBe(reg.userId);

    // Replay the verify token — idempotent.
    const v2 = await verifyEmail(t.db, reg.verifyToken);
    expect(v2.alreadyVerified).toBe(true);

    const lr = await login(
      t.db,
      { email: "alice@example.de", password: "Verysecret!23" },
      { ip: "1.1.1.1" },
    );
    expect(lr.token.split(".")).toHaveLength(3);
    expect(lr.sessionId).toMatch(/^ses_/);

    const me = await getCurrentUser(t.db, lr.token);
    expect(me?.id).toBe(reg.userId);
    expect(me?.email).toBe("alice@example.de");

    await logout(t.db, { userId: lr.userId, sessionId: lr.sessionId });
    const me2 = await getCurrentUser(t.db, lr.token);
    expect(me2).toBeNull();
  });

  it("rejects login before email verification", async () => {
    const reg = await register(
      t.db,
      { email: "bob@example.de", password: "Verysecret!23" },
      { ip: "2.2.2.2", publicSiteUrl: "https://bdas.de" },
    );
    expect(reg.userId).toBeTruthy();

    await expect(
      login(t.db, { email: "bob@example.de", password: "Verysecret!23" }, { ip: "2.2.2.2" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects wrong password and never reveals which field was wrong", async () => {
    await register(
      t.db,
      { email: "carol@example.de", password: "Verysecret!23" },
      { ip: "3.3.3.3", publicSiteUrl: "https://bdas.de" },
    );

    await expect(
      login(t.db, { email: "carol@example.de", password: "wrongpasswordxx" }, { ip: "3.3.3.3" }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.stringMatching(/E-Mail oder Passwort/),
    });

    await expect(
      login(t.db, { email: "noone@example.de", password: "anything-anyway" }, { ip: "3.3.3.3" }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.stringMatching(/E-Mail oder Passwort/),
    });
  });

  it("rate-limits register by IP", async () => {
    for (let i = 0; i < 5; i++) {
      await register(
        t.db,
        { email: `flood-${i}@example.de`, password: "Verysecret!23" },
        { ip: "9.9.9.9", publicSiteUrl: "https://bdas.de" },
      );
    }
    await expect(
      register(
        t.db,
        { email: "flood-6@example.de", password: "Verysecret!23" },
        { ip: "9.9.9.9", publicSiteUrl: "https://bdas.de" },
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("password reset rotates the hash and revokes existing sessions", async () => {
    const reg = await register(
      t.db,
      { email: "dora@example.de", password: "Verysecret!23" },
      { ip: "4.4.4.4", publicSiteUrl: "https://bdas.de" },
    );
    await verifyEmail(t.db, reg.verifyToken);
    const lr = await login(
      t.db,
      { email: "dora@example.de", password: "Verysecret!23" },
      { ip: "4.4.4.4" },
    );

    const reqResult = await requestPasswordReset(
      t.db,
      { email: "dora@example.de" },
      { ip: "4.4.4.4" },
    );
    expect(reqResult).not.toBeNull();
    if (!reqResult) throw new Error("unreachable");

    await completePasswordReset(t.db, {
      token: reqResult.resetToken,
      password: "Newsecretpw!23",
    });

    // Old session is revoked.
    const me = await getCurrentUser(t.db, lr.token);
    expect(me).toBeNull();

    // Old password no longer works.
    await expect(
      login(t.db, { email: "dora@example.de", password: "Verysecret!23" }, { ip: "4.4.4.5" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    // New password works.
    const lr2 = await login(
      t.db,
      { email: "dora@example.de", password: "Newsecretpw!23" },
      { ip: "4.4.4.5" },
    );
    expect(lr2.token).toBeTruthy();
  });

  it("password reset for unknown email returns null (no enumeration)", async () => {
    const result = await requestPasswordReset(
      t.db,
      { email: "ghost@example.de" },
      { ip: "5.5.5.5" },
    );
    expect(result).toBeNull();
  });

  it("federal-board allowlist attaches the role at JWT mint", async () => {
    process.env["BDAS_FEDERAL_BOARD_EMAILS"] = "eve@example.de";
    const reg = await register(
      t.db,
      { email: "eve@example.de", password: "Verysecret!23" },
      { ip: "6.6.6.6", publicSiteUrl: "https://bdas.de" },
    );
    await verifyEmail(t.db, reg.verifyToken);
    const lr = await login(
      t.db,
      { email: "eve@example.de", password: "Verysecret!23" },
      { ip: "6.6.6.6" },
    );
    const me = await getCurrentUser(t.db, lr.token);
    expect(me?.roles).toContain("federal_board");
  });
});
