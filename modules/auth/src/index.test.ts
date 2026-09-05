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

import { eq } from "drizzle-orm";

import { register } from "./services/register";
import { verifyEmail } from "./services/verify";
import { login } from "./services/login";
import { logout } from "./services/logout";
import { completePasswordReset, requestPasswordReset } from "./services/password-reset";
import { resendVerification } from "./services/resend-verification";
import { getCurrentUser } from "./services/me";
import { getUserExport } from "./services/export";
import { passwordSchema, PASSWORD_MIN_LENGTH } from "./password";
import { CONSENT_VERSION } from "./consent";
import { authEmailVerifications } from "./schema";

describe("password policy", () => {
  it("enforces min length + upper + lower + special, no digit required", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(passwordSchema.safeParse("Abc!456").success).toBe(false); // 7 chars
    expect(passwordSchema.safeParse("abcdefg!").success).toBe(false); // no upper
    expect(passwordSchema.safeParse("ABCDEFG!").success).toBe(false); // no lower
    expect(passwordSchema.safeParse("Abcdefg1").success).toBe(false); // no special
    expect(passwordSchema.safeParse("Abcdefg!").success).toBe(true); // 8, upper+lower+special
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
    for (const file of ["0001_init.sql", "0002_consent.sql"]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
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
      { email: "alice@example.de", password: "Verysecret!23", consent: true },
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

  it("requires GDPR consent and records the accepted version", async () => {
    await expect(
      register(
        t.db,
        { email: "noconsent@example.de", password: "Verysecret!23", consent: false },
        { ip: "7.7.7.7", publicSiteUrl: "https://bdas.de" },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const reg = await register(
      t.db,
      { email: "consent@example.de", password: "Verysecret!23", consent: true },
      { ip: "7.7.7.7", publicSiteUrl: "https://bdas.de" },
    );
    const rows = await t.client`
      SELECT consent_at, consent_version FROM auth_users WHERE id = ${reg.userId}
    `;
    expect(rows[0]?.["consent_at"]).not.toBeNull();
    expect(rows[0]?.["consent_version"]).toBe(CONSENT_VERSION);
  });

  it("getUserExport returns the user's own account row, or null", async () => {
    const reg = await register(
      t.db,
      { email: "export@example.de", password: "Verysecret!23", consent: true },
      { ip: "8.8.8.8", publicSiteUrl: "https://bdas.de" },
    );

    const exp = await getUserExport(t.db, reg.userId);
    expect(exp?.id).toBe(reg.userId);
    expect(exp?.email).toBe("export@example.de");
    expect(exp?.status).toBe("unverified");
    expect(exp?.consentVersion).toBe(CONSENT_VERSION);
    expect(exp?.consentAt).not.toBeNull();

    expect(await getUserExport(t.db, "usr_does_not_exist")).toBeNull();
  });

  it("rejects login before email verification", async () => {
    const reg = await register(
      t.db,
      { email: "bob@example.de", password: "Verysecret!23", consent: true },
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
      { email: "carol@example.de", password: "Verysecret!23", consent: true },
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
        { email: `flood-${i}@example.de`, password: "Verysecret!23", consent: true },
        { ip: "9.9.9.9", publicSiteUrl: "https://bdas.de" },
      );
    }
    await expect(
      register(
        t.db,
        { email: "flood-6@example.de", password: "Verysecret!23", consent: true },
        { ip: "9.9.9.9", publicSiteUrl: "https://bdas.de" },
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("password reset rotates the hash and revokes existing sessions", async () => {
    const reg = await register(
      t.db,
      { email: "dora@example.de", password: "Verysecret!23", consent: true },
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

  it("resendVerification returns null for unknown email", async () => {
    const result = await resendVerification(t.db, "nobody@example.de");
    expect(result).toBeNull();
  });

  it("resendVerification returns null for an already-active user", async () => {
    const reg = await register(
      t.db,
      { email: "active-resend@example.de", password: "Verysecret!23", consent: true },
      { ip: "10.0.0.1", publicSiteUrl: "https://bdas.de" },
    );
    await verifyEmail(t.db, reg.verifyToken);

    const result = await resendVerification(t.db, "active-resend@example.de");
    expect(result).toBeNull();
  });

  it("resendVerification issues a new token and removes the old unused one", async () => {
    const reg = await register(
      t.db,
      { email: "resend-test@example.de", password: "Verysecret!23", consent: true },
      { ip: "10.0.0.2", publicSiteUrl: "https://bdas.de" },
    );
    const oldToken = reg.verifyToken;

    const result = await resendVerification(t.db, "resend-test@example.de");
    expect(result).not.toBeNull();
    expect(result!.verifyToken).not.toBe(oldToken);

    // Old token must be gone from the DB.
    const remaining = await t.db
      .select()
      .from(authEmailVerifications)
      .where(eq(authEmailVerifications.token, oldToken));
    expect(remaining).toHaveLength(0);

    // New token exists and is valid for verification.
    const v = await verifyEmail(t.db, result!.verifyToken);
    expect(v.alreadyVerified).toBe(false);
  });

  it("federal-board allowlist attaches the role at JWT mint", async () => {
    process.env["BDAS_FEDERAL_BOARD_EMAILS"] = "eve@example.de";
    const reg = await register(
      t.db,
      { email: "eve@example.de", password: "Verysecret!23", consent: true },
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
