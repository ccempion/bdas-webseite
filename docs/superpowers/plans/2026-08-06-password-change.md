# Passwort ändern — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in member can change their password from `/account` by proving the current one, which revokes every other session and sends a notification mail.

**Architecture:** A new service in `modules/auth` (the module that owns `auth_credentials` and `auth_sessions`) rotates the hash and revokes sibling sessions in one transaction, then publishes `auth.password.changed`. The Server Action in `apps/web` sends the notification to the address `getCurrentUser` already resolved, mirroring how `requestPasswordReset` returns its result and lets the caller mail it. The UI is a `<details>` accordion card on `/account`.

**Tech Stack:** TypeScript, Drizzle ORM on Postgres, zod, `@node-rs/argon2`, Next.js 14 App Router Server Actions, vitest (integration against Docker Postgres), Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-06-password-change-design.md`](../specs/2026-08-06-password-change-design.md) · Issue [#108](https://github.com/ccempion/bdas-webseite/issues/108)

## Global Constraints

- Module rule 1: only `modules/auth` touches `auth_credentials` and `auth_sessions`. `modules/profile` and `modules/members` are not modified by this plan.
- Module rule 8: anything `apps/web` imports must be re-exported from `modules/auth/src/index.ts`. Deep imports are a CI failure.
- No new feature flag. This extends `auth`; `/account` already runs behind `requireAuthFlag()` and the action calls `requireFlag("auth")`.
- Password policy stays in `modules/auth/src/password.ts`. Validate the new password through the existing `passwordSchema` — never re-declare the rule.
- Rate limit key: `password-change:user:${userId}`, limit `5`, window `60 * 60 * 1000`.
- All user-facing copy is German.
- Design tokens only — no inline hex, radius, shadow or duration. The accordion is `<details className="bdas-accordion">`, styled globally in `apps/web/app/globals.css`.
- Tests ship in the same commits as the code.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0114MqtsNEihFXyZU6QpRzsp
  ```

## File Structure

| File                                                | Responsibility                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `modules/auth/src/services/password-change.ts`      | **Create.** The `changePassword` service: verify, rotate, revoke siblings, publish.           |
| `modules/auth/src/services/password-change.test.ts` | **Create.** Integration tests against Docker Postgres.                                        |
| `modules/auth/src/events.ts`                        | **Modify.** Add `PasswordChanged`, extend the `AuthEvent` union.                              |
| `modules/auth/src/notifier.ts`                      | **Modify.** Add `PasswordChangedMessage` to `AuthMessage`; handle it in `consoleNotifier`.    |
| `modules/auth/src/notifier-resend.ts`               | **Modify.** Render the `changed` mail.                                                        |
| `modules/auth/src/notifier-resend.test.ts`          | **Modify.** Cover the `changed` branch.                                                       |
| `modules/auth/src/index.ts`                         | **Modify.** Export `changePassword`, `ChangePasswordInput`, its types, and `PasswordChanged`. |
| `apps/web/app/account/password-actions.ts`          | **Create.** Server Action: resolve the session, call the service, send the mail.              |
| `apps/web/app/account/ChangePasswordCard.tsx`       | **Create.** Client component: accordion + form + result banner.                               |
| `apps/web/app/account/page.tsx`                     | **Modify.** Render the card below "Meine Daten".                                              |
| `e2e/password-change.e2e.ts`                        | **Create.** Browser flow: change, then sign in with the new password.                         |

**Deviation from the spec, deliberate:** the spec put the e2e in `e2e/auth.e2e.ts`. That file is one long linear register→verify→login→logout→reset→re-login flow; appending a sixth phase makes an already-long test longer. A separate file matches `e2e/resend-verification.e2e.ts`, which split out for the same reason.

---

### Task 1: `changePassword` service

**Files:**

- Create: `modules/auth/src/services/password-change.ts`
- Create: `modules/auth/src/services/password-change.test.ts`
- Modify: `modules/auth/src/events.ts`
- Modify: `modules/auth/src/index.ts:49-57` (the events export block) and the services block above it

**Interfaces:**

- Consumes: `hashPassword`, `verifyPassword`, `passwordSchema`, `PASSWORD_ALGORITHM` from `../password`; `rateLimit` from `../rate-limit`; `authCredentials`, `authSessions` from `../schema`; `getEventBus` from `@bdas/events`; `ValidationError`, `NotFoundError` from `@bdas/errors`.
- Produces:

  ```ts
  export type ChangePasswordContext = {
    readonly userId: string;
    readonly sessionId: string;
    readonly ip: string;
  };
  export type ChangePasswordResult = { readonly userId: string };
  export const ChangePasswordInput: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
  }>;
  export function changePassword(
    db: Db,
    input: unknown,
    ctx: ChangePasswordContext,
  ): Promise<ChangePasswordResult>;
  export type PasswordChanged = {
    readonly type: "auth.password.changed";
    readonly userId: string;
    readonly at: Date;
  };
  ```

- [ ] **Step 1: Add the event type**

In `modules/auth/src/events.ts`, after the `PasswordReset` type:

```ts
/**
 * A signed-in user chose a new password. Deliberately distinct from
 * PasswordReset — "I changed it" and "I had lost it" are different signals.
 */
export type PasswordChanged = {
  readonly type: "auth.password.changed";
  readonly userId: string;
  readonly at: Date;
};
```

And extend the union at the bottom of the same file:

```ts
export type AuthEvent =
  | UserRegistered
  | UserVerified
  | UserLoggedIn
  | UserLoggedOut
  | PasswordReset
  | PasswordChanged;
```

- [ ] **Step 2: Write the failing test**

Create `modules/auth/src/services/password-change.test.ts`. Note the `../` import depth — this file sits in `services/`, one level below `index.test.ts`, so migrations resolve via `path.join(__dirname, "..", "..", "migrations", file)`.

Watch the login budget if you add cases: `login` rate limits `login:email:<email>` at 5 per 15 minutes, and `createTestDb` gives each test a fresh schema (so the counter resets per test, not per case within one). The heaviest test below uses 3 logins. A sixth login in a single test fails with `Zu viele Versuche` rather than the assertion you wrote — use a second email if you need more.

```ts
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
    return { userId: reg.userId, email, ...session };
  }

  it("rotates the hash: the old password stops working, the new one starts", async () => {
    const u = await signedInUser();

    const res = await changePassword(
      t.db,
      { currentPassword: OLD, newPassword: NEW },
      { userId: u.userId, sessionId: u.sessionId, ip: "1.1.1.1" },
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
        { userId: u.userId, sessionId: u.sessionId, ip: "1.1.1.1" },
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
      changePassword(
        t.db,
        { currentPassword: OLD, newPassword: "kurz" },
        { userId: u.userId, sessionId: u.sessionId, ip: "1.1.1.1" },
      ),
    ).rejects.toThrow(/mindestens 10 Zeichen/);
  });

  it("rejects a new password identical to the current one", async () => {
    const u = await signedInUser();
    await expect(
      changePassword(
        t.db,
        { currentPassword: OLD, newPassword: OLD },
        { userId: u.userId, sessionId: u.sessionId, ip: "1.1.1.1" },
      ),
    ).rejects.toThrow("Das neue Passwort muss sich vom aktuellen unterscheiden.");
  });

  it("revokes every other session but keeps the calling one alive", async () => {
    const u = await signedInUser();
    // Two more devices for the same user.
    const phone = await login(t.db, { email: u.email, password: OLD }, { ip: "2.2.2.2" });
    const tablet = await login(t.db, { email: u.email, password: OLD }, { ip: "3.3.3.3" });

    await changePassword(
      t.db,
      { currentPassword: OLD, newPassword: NEW },
      { userId: u.userId, sessionId: u.sessionId, ip: "1.1.1.1" },
    );

    expect(await getCurrentUser(t.db, u.token)).not.toBeNull();
    expect(await getCurrentUser(t.db, phone.token)).toBeNull();
    expect(await getCurrentUser(t.db, tablet.token)).toBeNull();

    const rows = await t.db
      .select({ id: authSessions.id, revokedAt: authSessions.revokedAt })
      .from(authSessions)
      .where(eq(authSessions.userId, u.userId));
    const calling = rows.find((r) => r.id === u.sessionId);
    expect(calling?.revokedAt).toBeNull();
    expect(rows.filter((r) => r.revokedAt !== null)).toHaveLength(2);
  });

  it("rate limits after 5 attempts in the window", async () => {
    const u = await signedInUser();
    const ctx = { userId: u.userId, sessionId: u.sessionId, ip: "1.1.1.1" };
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

    await changePassword(
      t.db,
      { currentPassword: OLD, newPassword: NEW },
      { userId: u.userId, sessionId: u.sessionId, ip: "1.1.1.1" },
    );

    expect(seen).toEqual([{ userId: u.userId }]);
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

```bash
pnpm vitest run modules/auth/src/services/password-change.test.ts
```

Expected: FAIL — `Failed to resolve import "./password-change"`.

If instead every test **skips**, Postgres is not reachable. Start it with `pnpm db:up` and re-run; do not proceed on a skipped suite.

- [ ] **Step 4: Implement the service**

Create `modules/auth/src/services/password-change.ts`:

```ts
/**
 * Changing the password while signed in.
 *
 * Unlike the reset flow, the proof is the current password rather than an
 * emailed token — and the session that made the change survives it, while
 * every other session for that user does not. A stolen cookie does not
 * outlive the change; the device you changed from does.
 */
import { and, eq, isNull, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { PasswordChanged as PasswordChangedEvent } from "../events";
import { hashPassword, passwordSchema, verifyPassword, PASSWORD_ALGORITHM } from "../password";
import { rateLimit } from "../rate-limit";
import { authCredentials, authSessions } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1, "Bitte gib dein aktuelles Passwort ein.").max(256),
  newPassword: passwordSchema,
});

export type ChangePasswordContext = {
  readonly userId: string;
  /** The session the change was made from — the one session that survives it. */
  readonly sessionId: string;
  readonly ip: string;
};

export type ChangePasswordResult = { readonly userId: string };

export async function changePassword(
  db: Db,
  input: unknown,
  ctx: ChangePasswordContext,
): Promise<ChangePasswordResult> {
  const parsed = ChangePasswordInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
  }
  const { currentPassword, newPassword } = parsed.data;

  // Without this the form is a password oracle for anyone holding a stolen
  // session: unlimited guesses at `currentPassword`, leaving no trace.
  await rateLimit(db, {
    key: `password-change:user:${ctx.userId}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

  // No join to auth_users: the caller resolved the user through
  // getCurrentUser before calling, so it already holds the email address
  // the notification goes to. Reading it again here would be a second
  // query to hand back something the caller never let go of.
  const rows = await db
    .select({ hashedPassword: authCredentials.hashedPassword })
    .from(authCredentials)
    .where(eq(authCredentials.userId, ctx.userId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new NotFoundError("Konto nicht gefunden.");

  if (!(await verifyPassword(currentPassword, row.hashedPassword))) {
    throw new ValidationError("Aktuelles Passwort ist falsch.");
  }

  // A no-op submit would otherwise sign the user out of every other device
  // and mail them about a change that never happened.
  if (currentPassword === newPassword) {
    throw new ValidationError("Das neue Passwort muss sich vom aktuellen unterscheiden.");
  }

  const newHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(authCredentials)
      .set({
        hashedPassword: newHash,
        algorithm: PASSWORD_ALGORITHM,
        updatedAt: new Date(),
      })
      .where(eq(authCredentials.userId, ctx.userId));
    await tx
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(authSessions.userId, ctx.userId),
          isNull(authSessions.revokedAt),
          ne(authSessions.id, ctx.sessionId),
        ),
      );
  });

  const event: PasswordChangedEvent = {
    type: "auth.password.changed",
    userId: ctx.userId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return { userId: ctx.userId };
}
```

- [ ] **Step 5: Run the tests and verify they pass**

```bash
pnpm vitest run modules/auth/src/services/password-change.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Export from the module surface**

In `modules/auth/src/index.ts`, add to the services block after the `password-reset` export:

```ts
export {
  changePassword,
  ChangePasswordInput,
  type ChangePasswordContext,
  type ChangePasswordResult,
} from "./services/password-change";
```

And add `PasswordChanged` to the events export block at the bottom:

```ts
export type {
  AuthEvent,
  UserRegistered,
  UserVerified,
  UserLoggedIn,
  UserLoggedOut,
  PasswordReset,
  PasswordChanged,
} from "./events";
```

- [ ] **Step 7: Typecheck and lint**

```bash
pnpm --filter @bdas/auth typecheck && pnpm lint
```

Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add modules/auth/src/services/password-change.ts \
        modules/auth/src/services/password-change.test.ts \
        modules/auth/src/events.ts \
        modules/auth/src/index.ts
git commit -m "$(cat <<'EOF'
feat(auth): change the password with the current one as proof

Rotates the hash and revokes every session for the user except the one
the change was made from, in a single transaction. Rate limited per user
so the form can't be used to guess the current password.

Issue #108.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0114MqtsNEihFXyZU6QpRzsp
EOF
)"
```

---

### Task 2: Notification mail

**Files:**

- Modify: `modules/auth/src/notifier.ts`
- Modify: `modules/auth/src/notifier-resend.ts:31-44` (the `render` function)
- Modify: `modules/auth/src/notifier-resend.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces:

  ```ts
  export type PasswordChangedMessage = { readonly kind: "changed"; readonly to: string };
  // AuthMessage becomes: VerifyEmailMessage | ResetPasswordMessage | PasswordChangedMessage
  ```

  Task 3 calls `getNotifier().send({ kind: "changed", to: email })`.

- [ ] **Step 1: Write the failing test**

Add to `modules/auth/src/notifier-resend.test.ts`, inside the existing `describe` block:

```ts
it("renders the password-changed mail with no link in it", async () => {
  sendMock.mockResolvedValue({ data: { id: "re_123" }, error: null });
  const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });

  await notifier.send({ kind: "changed", to: "x@example.org" });

  const arg = sendMock.mock.calls[0]?.[0];
  expect(arg.subject).toBe("BDAS — Passwort geändert");
  expect(arg.text).toContain("geändert");
  // A tripwire mail also reaches an attacker who already holds the account;
  // it must not hand them a link that does anything.
  expect(arg.html).not.toContain("<a ");
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
pnpm vitest run modules/auth/src/notifier-resend.test.ts
```

Expected: FAIL — TypeScript rejects `kind: "changed"` as not assignable to `AuthMessage`, or the assertion on `subject` fails because `render` falls through to the reset branch.

- [ ] **Step 3: Add the message kind**

In `modules/auth/src/notifier.ts`, add the type after `ResetPasswordMessage`:

```ts
/** Sent after a signed-in user changes their password. Carries no link:
 *  by definition this mail also reaches someone whose account was taken
 *  over, and a token in it would be a fresh attack surface. */
export type PasswordChangedMessage = {
  readonly kind: "changed";
  readonly to: string;
};

export type AuthMessage = VerifyEmailMessage | ResetPasswordMessage | PasswordChangedMessage;
```

Replace the `consoleNotifier` body so every kind is handled:

```ts
export const consoleNotifier: Notifier = {
  async send(message: AuthMessage): Promise<void> {
    if (message.kind === "verify") {
      console.log(`[auth] verify ${message.to} → ${message.verifyUrl}`);
    } else if (message.kind === "reset") {
      console.log(`[auth] reset  ${message.to} → ${message.resetUrl}`);
    } else {
      console.log(`[auth] changed ${message.to}`);
    }
  },
};
```

- [ ] **Step 4: Render the mail**

In `modules/auth/src/notifier-resend.ts`, insert a branch in `render` before the final `return` (which stays the reset branch):

```ts
if (message.kind === "changed") {
  return {
    subject: "BDAS — Passwort geändert",
    text: `Hallo,\n\ndein BDAS-Passwort wurde soeben geändert. Alle anderen Geräte wurden abgemeldet.\n\nWarst du das nicht? Dann setze dein Passwort sofort über "Passwort vergessen" auf der Anmeldeseite zurück und melde dich bei deinem lokalen Vorstand.\n`,
    html: `<p>Hallo,</p><p>dein BDAS-Passwort wurde soeben geändert. Alle anderen Geräte wurden abgemeldet.</p><p>Warst du das nicht? Dann setze dein Passwort sofort über &bdquo;Passwort vergessen&ldquo; auf der Anmeldeseite zurück und melde dich bei deinem lokalen Vorstand.</p>`,
  };
}
```

- [ ] **Step 5: Run the tests and verify they pass**

```bash
pnpm vitest run modules/auth/src/notifier-resend.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm --filter @bdas/auth typecheck
git add modules/auth/src/notifier.ts modules/auth/src/notifier-resend.ts modules/auth/src/notifier-resend.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): mail the user when their password changes

The tripwire that tells someone their account was taken over. Carries no
link — this mail reaches the attacker too.

Issue #108.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0114MqtsNEihFXyZU6QpRzsp
EOF
)"
```

---

### Task 3: Server Action

**Files:**

- Create: `apps/web/app/account/password-actions.ts`

**Interfaces:**

- Consumes: `changePassword` and `getNotifier` from `@bdas/auth` (Tasks 1 and 2); `getCurrentUser` from `@bdas/auth`; `readSessionCookie` from `apps/web/lib/auth-cookie`; `bootAuth` from `apps/web/lib/auth-bootstrap`.
- Produces:

  ```ts
  export type ChangePasswordState = { readonly ok?: true; readonly error?: string };
  export function changePasswordAction(
    _prev: ChangePasswordState,
    formData: FormData,
  ): Promise<ChangePasswordState>;
  ```

  Form field names: `currentPassword`, `newPassword`, `confirmPassword`.

- [ ] **Step 1: Write the action**

There is no unit test for this file. It is a thin Server Action — `cookies()` and `headers()` need a Next request scope, which vitest does not provide; the repo tests these through Playwright instead (see Task 5). The logic worth testing lives in Task 1 and is covered there.

Create `apps/web/app/account/password-actions.ts`:

```ts
"use server";

import { headers } from "next/headers";

import { changePassword, getCurrentUser, getNotifier } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";

import { bootAuth } from "../../lib/auth-bootstrap";
import { readSessionCookie } from "../../lib/auth-cookie";

export type ChangePasswordState = {
  /** Set only on a successful change — the form uses it to collapse. */
  readonly ok?: true;
  readonly error?: string;
};

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  requireFlag("auth");
  bootAuth();

  const db = getDb();
  const me = await getCurrentUser(db, readSessionCookie());
  if (!me) return { error: "Anmeldung erforderlich." };

  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  // The client checks this too, for the faster feedback. This one is the
  // binding check: a Server Action is a public endpoint.
  if (newPassword !== confirmPassword) {
    return { error: "Die beiden neuen Passwörter stimmen nicht überein." };
  }

  try {
    await changePassword(
      db,
      { currentPassword: String(formData.get("currentPassword") ?? ""), newPassword },
      { userId: me.id, sessionId: me.sessionId, ip: clientIp() },
    );
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  try {
    // `me.email` is the address getCurrentUser already resolved — the
    // service has no reason to hand it back.
    await getNotifier().send({ kind: "changed", to: me.email });
  } catch (err) {
    // The new password is already committed. A failed notification must not
    // tell the user their change didn't happen — log it and report success.
    console.error("[auth] password change email send failed:", err);
  }

  return { ok: true };
}

function clientIp(): string {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "0.0.0.0";
}
```

Note: no `revalidatePath("/account")`. Nothing rendered on that page derives from the password, and revalidating would remount the card and discard the success banner.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @bdas/web typecheck && pnpm lint
```

Expected: both clean. A boundary-rule error here means Task 1 Step 6 or Task 2 Step 3 did not export something — fix the export, not the import.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/account/password-actions.ts
git commit -m "$(cat <<'EOF'
feat(web): server action for changing the password

Resolves userId and sessionId from the cookie so the calling session is
the one the service spares, then mails the notification best-effort.

Issue #108.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0114MqtsNEihFXyZU6QpRzsp
EOF
)"
```

---

### Task 4: The card on `/account`

**Files:**

- Create: `apps/web/app/account/ChangePasswordCard.tsx`
- Modify: `apps/web/app/account/page.tsx` (imports at the top; render after the "Meine Daten" `Card`, before the `<div>` holding the export/logout buttons at lines 154-163)

**Interfaces:**

- Consumes: `changePasswordAction`, `ChangePasswordState` from Task 3; `PASSWORD_RULE_HINT` from `@bdas/auth` (already exported).
- Produces: `export function ChangePasswordCard({ passwordHint }: { passwordHint: string })`.

- [ ] **Step 1: Write the component**

Create `apps/web/app/account/ChangePasswordCard.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Form, PasswordInput } from "@bdas/design-system";

import { changePasswordAction, type ChangePasswordState } from "./password-actions";

const EMPTY: ChangePasswordState = {};

/**
 * Changing a password is a rare act, so it stays collapsed behind the
 * accordion idiom (§7) rather than sitting open on a page that is mostly
 * about profile data.
 */
export function ChangePasswordCard({ passwordHint }: { passwordHint: string }) {
  const [state, action] = useFormState(changePasswordAction, EMPTY);
  const details = useRef<HTMLDetailsElement>(null);
  const [changed, setChanged] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!state.ok) return;
    setChanged(true);
    setNewPassword("");
    setConfirmPassword("");
    if (details.current) details.current.open = false;
  }, [state]);

  // Only once the repeat field has been typed in — nagging about a mismatch
  // against an empty box while someone is still typing the first one is noise.
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <Card flat className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-bdas-ink">Passwort</h2>

      {changed ? (
        <div className="mb-4">
          <Alert variant="success">Passwort geändert. Andere Geräte wurden abgemeldet.</Alert>
        </div>
      ) : null}

      <details ref={details} className="bdas-accordion">
        {/* onClick, not onToggle: the success effect closes the panel
            programmatically, and onToggle would fire then too — wiping the
            confirmation at the moment it appears. */}
        <summary onClick={() => setChanged(false)}>Passwort ändern</summary>
        <div>
          <Form action={action}>
            {state.error ? <Alert variant="error">{state.error}</Alert> : null}
            <Field label="Aktuelles Passwort" htmlFor="currentPassword">
              <PasswordInput
                id="currentPassword"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Neues Passwort" htmlFor="newPassword" hint={passwordHint}>
              <PasswordInput
                id="newPassword"
                name="newPassword"
                autoComplete="new-password"
                minLength={10}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Field
              label="Neues Passwort wiederholen"
              htmlFor="confirmPassword"
              {...(mismatch ? { error: "Die beiden Passwörter stimmen nicht überein." } : {})}
            >
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Field>
            <SubmitButton disabled={mismatch} />
          </Form>
        </div>
      </details>
    </Card>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Wird gespeichert…" : "Passwort ändern"}
    </Button>
  );
}
```

`Field` takes an optional `error` prop (`core/design-system/src/components/Form.tsx:15-26`) and renders it with `role="alert"`; it hides `hint` while `error` is set. The prop is spread conditionally rather than passed as `error={… : undefined}` because the repo compiles with `exactOptionalPropertyTypes`.

- [ ] **Step 2: Wire it into the page**

In `apps/web/app/account/page.tsx`, add to the `@bdas/auth` imports at the top:

```tsx
import { PASSWORD_RULE_HINT } from "@bdas/auth";
```

and alongside the other local component imports:

```tsx
import { ChangePasswordCard } from "./ChangePasswordCard";
```

Then render it directly after the closing `</Card>` of the "Meine Daten" section and before the `<div className="flex flex-wrap items-center gap-3">`:

```tsx
<ChangePasswordCard passwordHint={PASSWORD_RULE_HINT} />
```

- [ ] **Step 3: Typecheck, lint, and look at it**

```bash
pnpm --filter @bdas/web typecheck && pnpm lint
```

Then run the app and open `/account` signed in:

```bash
pnpm dev
```

Confirm: the card is collapsed, the `+` rotates to `×` on open, the left border and halo appear on `[open]`, a mismatched repeat shows the field error and disables the submit button, and a wrong current password shows the error inside the open panel.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/account/ChangePasswordCard.tsx apps/web/app/account/page.tsx
git commit -m "$(cat <<'EOF'
feat(web): change the password from Mein Konto

Collapsed behind the accordion idiom — a rare action shouldn't compete
with the profile data that page is mostly about.

Issue #108.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0114MqtsNEihFXyZU6QpRzsp
EOF
)"
```

---

### Task 5: End-to-end flow

**Files:**

- Create: `e2e/password-change.e2e.ts`

**Interfaces:**

- Consumes: `login`, `openMobileMenu`, `register`, `verify`, `PASSWORD` from `e2e/helpers/flows`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the spec**

Create `e2e/password-change.e2e.ts`:

```ts
/**
 * §23 — a signed-in member can change their password without their inbox.
 * Split out of auth.e2e.ts, which is already one long linear flow.
 */
import { expect, test } from "@playwright/test";

import { login, openMobileMenu, PASSWORD, register, verify } from "./helpers/flows";

const NEW_PASSWORD = "Ganz-Anderes-Pferd-7!";

test("change the password from /account, then sign in with the new one", async ({ page }) => {
  const email = `pw-${Date.now()}@example.de`;

  await register(page, { email });
  await verify(page, email);
  await login(page, email);

  await page.goto("/account");
  await page.getByRole("group", { name: "Passwort ändern" }).click();

  await page.getByLabel("Aktuelles Passwort", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Neues Passwort", { exact: true }).fill(NEW_PASSWORD);

  // Mismatched repeat blocks submission, matching repeat unblocks it.
  await page.getByLabel("Neues Passwort wiederholen", { exact: true }).fill("Etwas-Anderes-1!");
  await expect(page.getByRole("button", { name: "Passwort ändern" })).toBeDisabled();
  await page.getByLabel("Neues Passwort wiederholen", { exact: true }).fill(NEW_PASSWORD);

  await page.getByRole("button", { name: "Passwort ändern" }).click();

  await expect(page.getByText("Passwort geändert.")).toBeVisible();

  // The session that made the change survives it — no redirect to /anmelden.
  await expect(page).toHaveURL(/\/account$/);

  await openMobileMenu(page);
  await page.getByRole("button", { name: "Abmelden" }).click();

  await login(page, email, NEW_PASSWORD);
  await expect(page).not.toHaveURL(/\/anmelden/);
});
```

`{ exact: true }` on both password fields is required: `PasswordInput`'s reveal toggle carries `aria-label="Passwort anzeigen"`, which a substring match also picks up (see the header comment in `e2e/helpers/flows.ts`).

- [ ] **Step 2: Run it**

```bash
pnpm e2e password-change
```

Expected: PASS.

If the summary click fails to open the panel, the `getByRole("group")` selector is wrong for this markup — fall back to `page.locator("details:has(summary:text('Passwort ändern')) summary").click()` and keep the rest unchanged.

If the run fails to start at all, see the `local-e2e-environment` notes for getting Postgres and Chrome up on this machine.

- [ ] **Step 3: Full suite before opening the PR**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm e2e
```

Expected: all green. Report actual output — do not claim green without it.

- [ ] **Step 4: Commit and open the PR**

```bash
git add e2e/password-change.e2e.ts
git commit -m "$(cat <<'EOF'
test(e2e): change the password and sign in again with it

Issue #108.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0114MqtsNEihFXyZU6QpRzsp
EOF
)"
```

Then push the branch and open a PR that closes #108. Per the working agreement this PR needs both `/review` and `/security-review` — it touches auth.

---

## Notes for the reviewer

- **Not done here:** no session-management UI ("these devices are signed in"), no forced re-authentication window, no password history. All out of scope per the spec's non-goals.
- **`auth.password.changed` has no subscribers.** It is published for symmetry with `auth.password.reset` and for whatever listens later.
- **Merging is the user's.** Hand over the PR link; do not merge.
