# Konto-Löschung — PR1: Auth-Fundament Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `auth` everything it needs to trigger and cancel a 30-day account-deletion window: the request table, the feature flag, session revocation, the login-block message, and the request/cancel service — with no cascade, no UI, and no emails yet (those are later PRs).

**Architecture:** `auth` owns account lifecycle state, so the new `account_deletion_requests`/`account_deletion_steps` tables live in its migrations (Rule 7). `requestAccountDeletion` takes the display name as an input parameter rather than looking it up — auth doesn't own that data (members/profile do, per Rule 1) and the name has to survive the eventual hard delete as a snapshot. The reactivation token follows the exact pattern already used for password-reset/email-verification tokens in this module (plain random token as primary key, not hashed) for consistency with the rest of the module.

**Tech Stack:** TypeScript, Drizzle ORM (raw SQL migrations are authoritative; `schema.ts` mirrors them for query-building), Vitest + real Postgres (Docker) for integration tests, `@bdas/id`, `@bdas/errors`, `@bdas/events`.

**Spec:** `docs/superpowers/specs/2026-09-22-account-deletion-design.md` — this plan implements §2 decisions 1 and 4, and the `auth`-owned half of §3 and §4.

## Global Constraints

- Rule 1 (CLAUDE.md §1): `requestAccountDeletion` must not read `members`/`profile` tables directly — `displayName` is a caller-supplied input.
- Rule 5: integration tests run against real Postgres (Docker), never mocked. Skip via `describeIfDb` when `DATABASE_URL` is unreachable, matching `delete-account.test.ts`.
- Rule 7: the new tables are `modules/auth/migrations/0004_account_deletion.sql`, not a shared/infra migration. No `infra/migrations/manifest.ts` change needed — `auth` is already first in the manifest and files within a module run in filename order.
- Rule 8: only symbols re-exported from `modules/auth/src/index.ts` are public.
- Money/dates/IDs: use `createId("adr", ...)` for new row ids (module prefix convention in `core/id`), not `gen_random_uuid()` — this codebase's ids are app-generated `text`, not Postgres `uuid`.
- Per user memory: run `pnpm format` before every commit (CI's format check has failed on unformatted output before).
- This PR does **not** touch `file_access_log` — that FK fix (spec §2 decision 2) belongs to the `files` module's own migrations and lands in PR4, not here (Rule 7 ownership).

---

### Task 1: `account_deletion` feature flag

**Files:**
- Modify: `core/feature-flags/src/index.ts`
- Test: `core/feature-flags/src/index.test.ts`

**Interfaces:**
- Produces: `"account_deletion"` as a valid `FlagName`.

- [ ] **Step 1: Write the failing test**

Add to `core/feature-flags/src/index.test.ts`, inside the `describe("isFlagOn", ...)` block, after the `onboarding` case:

```ts
  it("account_deletion maps to BDAS_FLAG_ACCOUNT_DELETION", () => {
    delete process.env["BDAS_FLAG_ACCOUNT_DELETION"];
    expect(isFlagOn("account_deletion")).toBe(false);
    process.env["BDAS_FLAG_ACCOUNT_DELETION"] = "true";
    expect(isFlagOn("account_deletion")).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/feature-flags test`
Expected: FAIL — TypeScript error, `"account_deletion"` is not assignable to `FlagName`.

- [ ] **Step 3: Add the flag**

In `core/feature-flags/src/index.ts`, add `"account_deletion"` to the `FLAGS` array (after `"onboarding"`):

```ts
export const FLAGS = [
  "auth",
  "members",
  "groups",
  "events",
  "files",
  "notifications",
  "projects",
  "blog",
  "blog_comments",
  "handover",
  "payments",
  "dashboard",
  "public_shell",
  "group_map",
  "content",
  "profile",
  "faq",
  "faq_suite",
  "newsletter",
  "podcast",
  "onboarding",
  "account_deletion",
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/feature-flags test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
pnpm format
git add core/feature-flags/src/index.ts core/feature-flags/src/index.test.ts
git commit -m "feat(feature-flags): add account_deletion flag

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Migration + Drizzle schema mirror

**Files:**
- Create: `modules/auth/migrations/0004_account_deletion.sql`
- Modify: `modules/auth/src/schema.ts`

**Interfaces:**
- Produces: Drizzle tables `accountDeletionRequests`, `accountDeletionSteps`; types `AccountDeletionRequest = typeof accountDeletionRequests.$inferSelect`.
- Consumes: `authUsers` from the same file.

No test file — DDL has no meaningful unit test in isolation; it's exercised by Task 4's integration test, which loads this migration. Verify this task by typecheck only.

- [ ] **Step 1: Write the migration**

Create `modules/auth/migrations/0004_account_deletion.sql`:

```sql
-- Self-service account deletion (DSGVO Art. 17), 30-day grace period before
-- the hard purge. See docs/superpowers/specs/2026-09-22-account-deletion-design.md.
--
-- user_id is ON DELETE SET NULL, not CASCADE: the row must survive the
-- eventual hard delete (modules/auth's account-deletion-sweep.ts, a later
-- PR) as the audit trail, and to carry the snapshotted email/name for the
-- post-purge confirmation email once auth_users no longer has them.

CREATE TABLE account_deletion_requests (
  id text PRIMARY KEY,
  user_id text REFERENCES auth_users(id) ON DELETE SET NULL,
  email_snapshot text NOT NULL,
  name_snapshot text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_purge_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reactivation_token text,
  reactivation_expires_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX account_deletion_requests_user_idx ON account_deletion_requests(user_id);
CREATE INDEX account_deletion_requests_status_idx ON account_deletion_requests(status, scheduled_purge_at);
CREATE UNIQUE INDEX account_deletion_requests_reactivation_token_idx
  ON account_deletion_requests(reactivation_token) WHERE reactivation_token IS NOT NULL;

-- Per-module purge progress, so a retried cron sweep can skip modules it
-- already finished instead of re-running a destructive step (PR8).
CREATE TABLE account_deletion_steps (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES account_deletion_requests(id) ON DELETE CASCADE,
  module_name text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, module_name)
);
```

- [ ] **Step 2: Mirror it in `schema.ts`**

In `modules/auth/src/schema.ts`, add `unique` to the import list:

```ts
import { index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
```

Then add, after `authRateLimits`:

```ts
export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => authUsers.id, { onDelete: "set null" }),
    emailSnapshot: text("email_snapshot").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    scheduledPurgeAt: timestamp("scheduled_purge_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    reactivationToken: text("reactivation_token"),
    reactivationExpiresAt: timestamp("reactivation_expires_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("account_deletion_requests_user_idx").on(t.userId),
    statusIdx: index("account_deletion_requests_status_idx").on(t.status, t.scheduledPurgeAt),
  }),
);

export const accountDeletionSteps = pgTable(
  "account_deletion_steps",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => accountDeletionRequests.id, { onDelete: "cascade" }),
    moduleName: text("module_name").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestModuleUq: unique("account_deletion_steps_request_module_uq").on(t.requestId, t.moduleName),
  }),
);

export type AccountDeletionRequest = typeof accountDeletionRequests.$inferSelect;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bdas/auth typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add modules/auth/migrations/0004_account_deletion.sql modules/auth/src/schema.ts
git commit -m "feat(auth): add account_deletion_requests/_steps tables

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Auth events

**Files:**
- Modify: `modules/auth/src/events.ts`

**Interfaces:**
- Produces: `AccountDeletionRequested`, `AccountDeletionCancelled`, both added to the `AuthEvent` union.
- Consumes: nothing new.

No isolated test — event *types* have no runtime behavior; Task 4's integration test asserts the events are actually published.

- [ ] **Step 1: Add the event types**

In `modules/auth/src/events.ts`, add after `UserDeleted`:

```ts
/**
 * A signed-in user asked to delete their account (DSGVO Art. 17). The
 * account is already locked and its sessions revoked when this fires; the
 * hard purge itself follows `scheduledPurgeAt`, handled by a later PR's
 * cron sweep, not by a subscriber to this event (spec §2 decision 1).
 */
export type AccountDeletionRequested = {
  readonly type: "auth.account_deletion.requested";
  readonly userId: string;
  readonly requestId: string;
  readonly scheduledPurgeAt: Date;
  readonly at: Date;
};

/** The user (or a reactivation link) cancelled a pending deletion in time. */
export type AccountDeletionCancelled = {
  readonly type: "auth.account_deletion.cancelled";
  readonly userId: string;
  readonly requestId: string;
  readonly at: Date;
};
```

- [ ] **Step 2: Add both to the union**

```ts
export type AuthEvent =
  | UserRegistered
  | UserVerified
  | UserLoggedIn
  | UserLoggedOut
  | PasswordReset
  | PasswordChanged
  | EmailChanged
  | UserDeleted
  | AccountDeletionRequested
  | AccountDeletionCancelled;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bdas/auth typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add modules/auth/src/events.ts
git commit -m "feat(auth): add account-deletion request/cancel events

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `requestAccountDeletion` / `cancelAccountDeletion` service

**Files:**
- Create: `modules/auth/src/services/account-deletion-request.ts`
- Modify: `modules/auth/src/sessions.ts` (add `revokeAllSessionsForUser`)
- Modify: `modules/auth/src/services/login.ts` (distinct message for `pending_deletion`)
- Test: `modules/auth/src/services/account-deletion-request.test.ts`

**Interfaces:**
- Consumes: `authUsers`, `accountDeletionRequests` from `../schema`; `randomToken` from `../tokens`; `createId` from `@bdas/id`; `getEventBus` from `@bdas/events`; `NotFoundError`/`ConflictError` from `@bdas/errors`.
- Produces:
  - `requestAccountDeletion(db, { userId, displayName }): Promise<{ requestId, scheduledPurgeAt, reactivationToken }>`
  - `cancelAccountDeletion(db, token): Promise<{ userId }>`
  - `getDeletionRequestForUser(db, userId): Promise<AccountDeletionRequest | null>`
  - `buildReactivationUrl(publicSiteUrl, token): string`
  - `ACCOUNT_DELETION_GRACE_DAYS = 30`
  - `revokeAllSessionsForUser(db, userId): Promise<void>` (internal — not re-exported from `index.ts`, same visibility as `createSession`/`revokeSession`)

This is one TDD cycle covering three files together (they only make sense as a unit — same pattern as `password-reset.ts`, whose inline session-revoke has no isolated test either), following `delete-account.test.ts`'s structure.

- [ ] **Step 1: Write the failing test file**

Create `modules/auth/src/services/account-deletion-request.test.ts`:

```ts
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

      const sessions = await t.db.select().from(authSessions).where(eq(authSessions.userId, reg.userId));
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);

      const stored = await getDeletionRequestForUser(t.db, reg.userId);
      expect(stored?.emailSnapshot).toBe("anna@example.de");
      expect(stored?.nameSnapshot).toBe("Anna Test");
      expect(stored?.status).toBe("pending");
    });

    it("publishes auth.account_deletion.requested", async () => {
      const published: AccountDeletionRequested[] = [];
      getEventBus().subscribe<AccountDeletionRequested>("auth.account_deletion.requested", async (e) => {
        published.push(e);
      });
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
      getEventBus().subscribe<AccountDeletionCancelled>("auth.account_deletion.cancelled", async (e) => {
        published.push(e);
      });
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
  });
});

describe("buildReactivationUrl", () => {
  it("builds a URL-encoded reactivation link", () => {
    expect(buildReactivationUrl("https://bdas.de/", "abc123")).toBe(
      "https://bdas.de/konto-reaktivieren/abc123",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/auth test account-deletion-request`
Expected: FAIL — `./account-deletion-request` does not exist, and `login.ts` doesn't throw the `/Löschung vorgemerkt/` message yet.

- [ ] **Step 3: Add `revokeAllSessionsForUser` to `sessions.ts`**

In `modules/auth/src/sessions.ts`, add after `revokeSession`:

```ts
/** Revokes every active session for a user — used when locking an account. */
export async function revokeAllSessionsForUser(db: Db, userId: string): Promise<void> {
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
}
```

- [ ] **Step 4: Add the `pending_deletion` message to `login.ts`**

In `modules/auth/src/services/login.ts`, replace:

```ts
  if (row.user.status !== "active") {
    throw new UnauthorizedError(
      "Bitte bestätige zuerst deine E-Mail-Adresse über den Link, den wir dir gesendet haben.",
    );
  }
```

with:

```ts
  if (row.user.status === "pending_deletion") {
    throw new UnauthorizedError(
      "Dieses Konto wurde zur Löschung vorgemerkt. Nutze den Reaktivierungslink aus der Bestätigungs-E-Mail, falls das nicht du warst.",
    );
  }
  if (row.user.status !== "active") {
    throw new UnauthorizedError(
      "Bitte bestätige zuerst deine E-Mail-Adresse über den Link, den wir dir gesendet haben.",
    );
  }
```

- [ ] **Step 5: Write `account-deletion-request.ts`**

Create `modules/auth/src/services/account-deletion-request.ts`:

```ts
/**
 * Self-service account deletion (DSGVO Art. 17): locks the account, revokes
 * all sessions, and schedules a hard purge 30 days out. The purge itself is
 * a later PR's account-deletion-sweep.ts — this file only covers triggering
 * and cancelling the 30-day window.
 *
 * `displayName` is supplied by the caller rather than looked up here: auth
 * doesn't own it (members/profile do, per CLAUDE.md §1 rule 1), and the
 * post-purge confirmation email needs a name snapshot that survives the
 * eventual hard delete of auth_users.
 */
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ConflictError, NotFoundError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { AccountDeletionCancelled, AccountDeletionRequested } from "../events";
import { accountDeletionRequests, authUsers, type AccountDeletionRequest } from "../schema";
import { revokeAllSessionsForUser } from "../sessions";
import { randomToken } from "../tokens";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const ACCOUNT_DELETION_GRACE_DAYS = 30;
const GRACE_MS = ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;

export type RequestAccountDeletionInput = {
  readonly userId: string;
  readonly displayName: string;
};

export type RequestAccountDeletionResult = {
  readonly requestId: string;
  readonly scheduledPurgeAt: Date;
  readonly reactivationToken: string;
};

export async function requestAccountDeletion(
  db: Db,
  input: RequestAccountDeletionInput,
): Promise<RequestAccountDeletionResult> {
  const [user] = await db
    .select({ id: authUsers.id, email: authUsers.emailNormalized })
    .from(authUsers)
    .where(eq(authUsers.id, input.userId))
    .limit(1);
  if (!user) throw new NotFoundError("Konto nicht gefunden.");

  const [existing] = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, input.userId),
        eq(accountDeletionRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) {
    throw new ConflictError("Für dieses Konto ist bereits eine Löschung angefragt.");
  }

  const now = new Date();
  const scheduledPurgeAt = new Date(now.getTime() + GRACE_MS);
  const requestId = createId("adr");
  const reactivationToken = randomToken();

  await db.transaction(async (tx) => {
    await tx.insert(accountDeletionRequests).values({
      id: requestId,
      userId: input.userId,
      emailSnapshot: user.email,
      nameSnapshot: input.displayName,
      requestedAt: now,
      scheduledPurgeAt,
      status: "pending",
      reactivationToken,
      reactivationExpiresAt: scheduledPurgeAt,
    });
    await tx
      .update(authUsers)
      .set({ status: "pending_deletion", updatedAt: now })
      .where(eq(authUsers.id, input.userId));
  });

  await revokeAllSessionsForUser(db, input.userId);

  const event: AccountDeletionRequested = {
    type: "auth.account_deletion.requested",
    userId: input.userId,
    requestId,
    scheduledPurgeAt,
    at: now,
  };
  await getEventBus().publish(event);

  return { requestId, scheduledPurgeAt, reactivationToken };
}

export async function cancelAccountDeletion(db: Db, token: string): Promise<{ readonly userId: string }> {
  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.reactivationToken, token),
        eq(accountDeletionRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (!row || !row.userId) {
    throw new NotFoundError("Reaktivierungslink ungültig oder bereits verwendet.");
  }
  if (!row.reactivationExpiresAt || row.reactivationExpiresAt < new Date()) {
    throw new NotFoundError("Reaktivierungslink ist abgelaufen.");
  }

  const now = new Date();
  const userId = row.userId;
  await db.transaction(async (tx) => {
    await tx
      .update(accountDeletionRequests)
      .set({ status: "cancelled", cancelledAt: now, reactivationToken: null })
      .where(eq(accountDeletionRequests.id, row.id));
    await tx.update(authUsers).set({ status: "active", updatedAt: now }).where(eq(authUsers.id, userId));
  });

  const event: AccountDeletionCancelled = {
    type: "auth.account_deletion.cancelled",
    userId,
    requestId: row.id,
    at: now,
  };
  await getEventBus().publish(event);

  return { userId };
}

export async function getDeletionRequestForUser(
  db: Db,
  userId: string,
): Promise<AccountDeletionRequest | null> {
  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(and(eq(accountDeletionRequests.userId, userId), eq(accountDeletionRequests.status, "pending")))
    .limit(1);
  return row ?? null;
}

export function buildReactivationUrl(publicSiteUrl: string, token: string): string {
  return `${publicSiteUrl.replace(/\/$/, "")}/konto-reaktivieren/${encodeURIComponent(token)}`;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @bdas/auth test account-deletion-request`
Expected: PASS (all cases). If the DB is unreachable, start it first: `pnpm db:up`.

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm --filter @bdas/auth typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add modules/auth/src/services/account-deletion-request.ts modules/auth/src/services/account-deletion-request.test.ts modules/auth/src/sessions.ts modules/auth/src/services/login.ts
git commit -m "feat(auth): requestAccountDeletion/cancelAccountDeletion (DSGVO Art. 17)

Locks the account, revokes sessions, and schedules a 30-day-out purge.
Reactivation is a single-use token, same pattern as password reset. The
hard purge itself is a later PR — this only covers trigger and cancel.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Public exports + full verification

**Files:**
- Modify: `modules/auth/src/index.ts`

**Interfaces:**
- Produces: `requestAccountDeletion`, `cancelAccountDeletion`, `getDeletionRequestForUser`, `buildReactivationUrl`, `ACCOUNT_DELETION_GRACE_DAYS`, `type RequestAccountDeletionInput`, `type RequestAccountDeletionResult`, `type AccountDeletionRequest`, `AccountDeletionRequested`, `AccountDeletionCancelled` — all now part of `@bdas/auth`'s public surface (Rule 8).

- [ ] **Step 1: Add the service exports**

In `modules/auth/src/index.ts`, after the `deleteAccount` export line:

```ts
export {
  requestAccountDeletion,
  cancelAccountDeletion,
  getDeletionRequestForUser,
  buildReactivationUrl,
  ACCOUNT_DELETION_GRACE_DAYS,
  type RequestAccountDeletionInput,
  type RequestAccountDeletionResult,
} from "./services/account-deletion-request";
export { type AccountDeletionRequest } from "./schema";
```

- [ ] **Step 2: Add the event type exports**

In the existing `export type { AuthEvent, ... } from "./events";` block, add `AccountDeletionRequested` and `AccountDeletionCancelled` to the list:

```ts
export type {
  AuthEvent,
  UserRegistered,
  UserVerified,
  UserLoggedIn,
  UserLoggedOut,
  PasswordReset,
  PasswordChanged,
  EmailChanged,
  UserDeleted,
  AccountDeletionRequested,
  AccountDeletionCancelled,
} from "./events";
```

- [ ] **Step 3: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: no errors (confirms nothing outside `auth` broke and the new exports resolve).

- [ ] **Step 4: Run the full test suite**

Run: `pnpm db:up && pnpm test`
Expected: all suites pass, including the new `account-deletion-request.test.ts`.

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add modules/auth/src/index.ts
git commit -m "feat(auth): export account-deletion request/cancel surface

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Self-Review

- **Spec coverage:** implements spec §3 (data model), the auth half of §4 (lock + revoke sessions + create request), and §2 decision 4 (reactivation link). §5 (sweep), §6 (export), §7 (Sperren hook), §8 (emails) are later PRs by design — this PR is foundation only. ✓
- **Placeholder scan:** none — every step has full code, no TBD/TODO. ✓
- **Type consistency:** `RequestAccountDeletionInput`/`Result` names match between the service file, its test, and the `index.ts` export. `AccountDeletionRequest` (the row type) vs `RequestAccountDeletionResult` (the function's return) are deliberately distinct names, checked for collision — none. `revokeAllSessionsForUser` is used identically in `account-deletion-request.ts` and its test's assertions (via `authSessions` query) match the column name (`revokedAt`). ✓
- **Rule 7 boundary:** confirmed `file_access_log` (files module) is untouched here — that migration is PR4's, not this one. ✓
- **Scope:** no UI, no cron, no other module touched — matches "PR1: Auth foundation" from the confirmed PR sequence. ✓

Plan complete and saved to `docs/superpowers/plans/2026-09-22-account-deletion-pr1-auth-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach? (Either way, `/security-review` runs on this PR before it's considered done, per your instruction — it locks accounts and handles single-use tokens.)
