# Account-Deletion PR9 — E2E Overall Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the one end-to-end test that proves the account-deletion feature (PR1–PR8) works as a single, continuous journey for one real account: request deletion via the browser → lock takes effect → (reactivation already covered) → the 30-day sweep purges every module → the account is genuinely gone → e-mail C goes out.

**Architecture:** Extend the existing `e2e/account-deletion.e2e.ts` with one new Playwright test. The request/lock legs run through the real browser/UI/Server-Action path exactly like the existing reactivation test. The sweep-to-completion leg cannot run through the real HTTP cron route in this e2e environment (see Global Constraints), so it calls `runAccountDeletionSweep` directly in the Playwright test's own Node process — the same real engine, the same real composition-root wiring (`apps/web/lib/account-deletion-composition.ts`), the same real Postgres — with only the two true externals faked (object storage, outbound mail), mirroring the pattern already proven in `apps/web/lib/account-deletion-composition.test.ts`. Cross-module fixture data (a file, a blog post, an event, a notification-log row) is seeded directly via SQL through a new `e2e/helpers/db.ts` helper, not through fragile UI flows — those flows are each already covered by their own dedicated e2e specs (`blog.e2e.ts`, `events.e2e.ts`, `files.e2e.ts`); this test's job is the orchestration journey, not re-proving each module's UI.

**Tech Stack:** Playwright (`*.e2e.ts`, `playwright.config.ts`), `postgres` (raw SQL via `e2e/helpers/db.ts`), the real `@bdas/auth` sweep engine, the real `apps/web/lib/account-deletion-composition.ts` composition root.

**Spec:** `docs/superpowers/specs/2026-09-22-account-deletion-design.md` §10 ("E2E: kompletter Ablauf Auslösen → Sperre wirkt (Login abgelehnt) → Reaktivierung funktioniert → (zweiter Lauf) Sweep → Konto und alle Modul-Daten weg → E-Mail C"). Orchestrator behavior: `docs/decisions/0055-konto-loeschung-orchestrator.md`.

## Global Constraints

- Test files are matched by `**/*.e2e.ts` (`playwright.config.ts:49`) — never `*.spec.ts`, which vitest picks up instead.
- `fullyParallel: false, workers: 1` (`playwright.config.ts:54-55`) — every spec in the suite runs serially against one shared Postgres. Every seeded email/id must stay unique per run (`uniqueEmail()` or a `Date.now()` suffix, matching the file's existing convention) so a shared DB never makes an assertion ambiguous.
- CLAUDE.md §4 / spec §10: integration tests run against real Postgres, never mocks. Only the two true externals — object storage and outbound mail — may be faked, exactly as `account-deletion-composition.test.ts` already does.
- `BDAS_FLAG_FILES` stays **off** in `playwright.config.ts`'s `APP_ENV` — do not turn it on. `e2e/files.e2e.ts` already self-skips in CI specifically because there is no object storage provisioned there (see its header comment); turning the flag on would change that test's behavior and still wouldn't provide a working `StorageClient` (`NotConfiguredStorageClient` throws unconditionally — `core/storage/src/index.ts:47-69`). The sweep-to-completion test must call `runAccountDeletionSweep` directly, never through `/api/cron/account-deletion-sweep`.
- Already set in `APP_ENV` and needing no changes: `BDAS_FLAG_ACCOUNT_DELETION`, `BDAS_FLAG_NOTIFICATIONS`, `BDAS_FLAG_NEWSLETTER`, `BDAS_FLAG_BLOG`, `E2E_EMAIL_CAPTURE`.
- Real Supabase storage stays explicitly out of scope. It is covered by the separate staging dry-run already tracked as a hard go-live prerequisite (ADR 0055, memory `account-deletion-pr-sequence`) — this plan only proves the orchestration logic with fake in-memory buckets.
- `setStorage`/`setNotifier`/`setMemberIdResolver` (from `@bdas/storage`, `@bdas/notifications`, `@bdas/files`) are module-level singletons, but calling them from the Playwright **test process** never reaches the actual running app **server process** (`next start` runs as a separate OS process) — they only affect direct in-process calls this same test makes. No cross-test or cross-process pollution risk.

## Review Focus

- **Assert on the specific request/fixture rows by id, not on the sweep's aggregate counts.** `SweepResult.processed`/`completed` counts every due request in the table; a stale `pending`/`in_progress` row left over from an earlier interrupted local run (CI always starts from an empty DB, but a reused local DB might not) would make an aggregate-count assertion flake. Query `account_deletion_requests` by this test's own `user_id` instead.
- **Login after the purge must show the generic invalid-credentials message, not the pending-deletion-specific one.** `modules/auth/src/services/login.ts:74-87`: an unknown email and a wrong password both throw `"E-Mail oder Passwort ungültig."`; only a *still-existing* user with `status = 'pending_deletion'` gets the specific `"...zur Löschung vorgemerkt..."` message. Asserting the generic message (and *not* the pending-deletion one) is what actually proves the row is gone, not merely still pending.
- **The backdate helper must scope its `UPDATE` to this exact user and `status = 'pending'`.** An unscoped or loosely-scoped `UPDATE account_deletion_requests SET scheduled_purge_at = ...` could reach another request row on a shared serial-run DB.
- **The direct-call path must wire every dependency the app's own boot normally provides**, before calling the sweep: `setStorage`, `setNotifier`, `setMemberIdResolver` for both `@bdas/files` and `@bdas/notifications`. Skipping any one throws (`NotConfiguredStorageClient`) or silently no-ops (an unresolved member id skips a step's real work without erroring) — the test must fail loudly, not pass by accident.
- **Reuse the real composition root (`buildDeletionSteps`, `completionMail`) instead of hand-rolling a parallel step list.** Hand-rolling the five-step order (`files → blog → profile_media → events → notifications`) in the test would silently drift out of sync if PR8's wiring ever changes, and the test would keep passing against a step list nobody ships.

---

## File Structure

- **Modify:** `e2e/helpers/db.ts` — add four small helpers: `userIdByEmail`, `authUserExists`, `backdateDeletionRequest`, `seedAccountDeletionFixture`. Same file that already owns every other raw-SQL e2e helper (`memberIdByEmail`, `seedEvent`, `seedRoleGrant`, …) — none of those have standalone unit tests; they're exercised through the specs that use them, and these follow the same convention.
- **Modify:** `e2e/account-deletion.e2e.ts` — update the now-stale header comment (it currently says the sweep "is out of scope" and "cannot yet test past reactivation" — both wrong since PR8 shipped) and add the new test.

No new files, no production code changes — PR8 already shipped everything this test exercises.

---

## Task 1: E2E DB helpers for the sweep test

**Files:**
- Modify: `e2e/helpers/db.ts`

**Interfaces:**
- Consumes: the module's existing `sql` client and `rand()` helper (both already private to this file).
- Produces (for Task 2):
  - `userIdByEmail(email: string): Promise<string | null>`
  - `authUserExists(email: string): Promise<boolean>`
  - `backdateDeletionRequest(userId: string, daysOverdue?: number): Promise<void>`
  - `seedAccountDeletionFixture(userId: string, memberId: string): Promise<{ fileStorageKey: string; blogMediaKey: string; profileMediaKey: string; eventId: string }>`

- [ ] **Step 1: Add the four helpers**

Add to `e2e/helpers/db.ts`, near `memberIdByEmail` (same section — auth/member lookups):

```typescript
/** The auth_users id for a login email, or null. Needed because
 *  memberIdByEmail() above returns the members row, not the auth_users row
 *  the deletion request and sweep key off. */
export async function userIdByEmail(email: string): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM auth_users WHERE email_normalized = lower(${email}) LIMIT 1`;
  return rows[0]?.id ?? null;
}

/** Whether an auth_users row still exists for this email — the direct proof
 *  that a purge really removed the account, not just marked it pending. */
export async function authUserExists(email: string): Promise<boolean> {
  const rows = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM auth_users WHERE email_normalized = lower(${email})`;
  return (rows[0]?.n ?? 0) > 0;
}

/** Move a pending deletion request's due date into the past, standing in for
 *  the real 30-day wait. Scoped to this exact user and status='pending' so it
 *  can never reach another request row on the shared e2e database. */
export async function backdateDeletionRequest(
  userId: string,
  daysOverdue = 1,
): Promise<void> {
  await sql`
    UPDATE account_deletion_requests
    SET scheduled_purge_at = now() - make_interval(days => ${daysOverdue})
    WHERE user_id = ${userId} AND status = 'pending'`;
}

/**
 * Plant one row of real, attributable data in each module the sweep purges,
 * directly via SQL rather than through each module's own (already separately
 * tested) UI flow — this test's job is the purge orchestration, not
 * re-proving blog/files/events authoring. Returns the storage keys the
 * fake buckets in the test need to start with, so the profile_media and blog
 * steps have something real to delete.
 */
export async function seedAccountDeletionFixture(
  userId: string,
  memberId: string,
): Promise<{
  fileStorageKey: string;
  blogMediaKey: string;
  profileMediaKey: string;
  eventId: string;
}> {
  const folderId = `fld_e2e_${rand()}`;
  const fileId = `fil_e2e_${rand()}`;
  const postId = `pst_e2e_${rand()}`;
  const eventId = `evt_e2e_${rand()}`;
  const notifId = `ntf_e2e_${rand()}`;
  const fileStorageKey = `files/${userId}/e2e-report.pdf`;
  const blogMediaKey = `${userId}/e2e-pic.png`;
  const profileMediaKey = `${userId}/e2e-photo.webp`;

  await sql`
    INSERT INTO folders (id, slug, name, scope)
    VALUES (${folderId}, ${"e2e-" + rand()}, 'E2E Ordner', 'members_all')`;
  await sql`
    INSERT INTO files (id, folder_id, filename, storage_key, mime_type, size_bytes, status, uploaded_by)
    VALUES (${fileId}, ${folderId}, 'e2e-report.pdf', ${fileStorageKey}, 'application/pdf', 1, 'ready', ${memberId})`;
  await sql`
    INSERT INTO posts (id, slug, title, content, created_by)
    VALUES (${postId}, ${"e2e-" + rand()}, 'E2E Beitrag', '{}', ${userId})`;
  await sql`
    INSERT INTO events (id, title, starts_at, created_by)
    VALUES (${eventId}, 'E2E Veranstaltung', now(), ${userId})`;
  await sql`
    INSERT INTO notification_log (id, member_id, template, to_email, subject, status)
    VALUES (${notifId}, ${memberId}, 'e2e', 'e2e@example.de', 'E2E', 'sent')`;

  return { fileStorageKey, blogMediaKey, profileMediaKey, eventId };
}
```

- [ ] **Step 2: No standalone test for this step**

These are thin SQL wrappers in the same style as every other helper already in this file (`memberIdByEmail`, `seedEvent`, `seedRoleGrant`, …), none of which have a dedicated test — they're verified by the spec that consumes them, in Task 2. Verifying them in isolation here would just be a second copy of the same SQL with no independent value.

- [ ] **Step 3: Commit**

```bash
git add e2e/helpers/db.ts
git commit -m "test(e2e): add account-deletion sweep fixture helpers"
```

---

## Task 2: The sweep-to-completion E2E test

**Files:**
- Modify: `e2e/account-deletion.e2e.ts`

**Interfaces:**
- Consumes:
  - `userIdByEmail`, `authUserExists`, `backdateDeletionRequest`, `seedAccountDeletionFixture` (Task 1)
  - `register`, `verify`, `login`, `PASSWORD` (`./helpers/flows`, already imported by this file)
  - `runAccountDeletionSweep` (`@bdas/auth`)
  - `buildDeletionSteps`, `completionMail` (`../apps/web/lib/account-deletion-composition`)
  - `setStorage` (`@bdas/storage`)
  - `setNotifier`, `setMemberIdResolver as setNotificationsMemberIdResolver`, `type OutboundEmail` (`@bdas/notifications`)
  - `setMemberIdResolver as setFilesMemberIdResolver` (`@bdas/files`)
  - `memberIdByEmail` (`./helpers/db`, already available)
- Produces: nothing consumed elsewhere — this is the leaf spec.

- [ ] **Step 1: Update the stale header comment**

Replace the file's header comment (currently claims the sweep is out of scope):

```typescript
/**
 * §23 — self-service account deletion, the full journey: request → lock
 * takes effect (login rejected) → reactivate → login works again (PR1–PR3);
 * and, for a second account that is *not* reactivated, request → the 30-day
 * sweep purges every module → the account is genuinely gone → e-mail C goes
 * out (PR8). The sweep step can't run through the real HTTP cron route in
 * this e2e environment (no object storage is provisioned — see
 * files.e2e.ts's header), so it calls the same real engine directly; see
 * docs/superpowers/plans/2026-09-25-account-deletion-pr9-e2e.md.
 */
```

- [ ] **Step 2: Write the failing test**

Add new imports at the top of `e2e/account-deletion.e2e.ts`:

```typescript
import { setMemberIdResolver as setFilesMemberIdResolver } from "@bdas/files";
import {
  setMemberIdResolver as setNotificationsMemberIdResolver,
  setNotifier,
  type OutboundEmail,
} from "@bdas/notifications";
import { setStorage, type StorageClient } from "@bdas/storage";
import { getDb } from "@bdas/db";

import {
  authUserExists,
  backdateDeletionRequest,
  memberIdByEmail,
  seedAccountDeletionFixture,
  userIdByEmail,
} from "./helpers/db";

// The composition root PR8 ships — reused here so this test exercises the
// exact wiring production uses, not a hand-rolled copy that could drift.
import { buildDeletionSteps, completionMail } from "../apps/web/lib/account-deletion-composition";
import { runAccountDeletionSweep } from "@bdas/auth";
```

Add the new test at the end of the file:

```typescript
test("requesting deletion, then letting the sweep run, purges the account across every module and sends e-mail C", async ({
  page,
}) => {
  const email = `del-sweep-${Date.now()}@example.de`;

  await register(page, { email });
  await verify(page);
  await login(page, email);

  const userId = await userIdByEmail(email);
  if (!userId) throw new Error("no auth_users row after registration");
  const memberId = await memberIdByEmail(email);
  if (!memberId) throw new Error("no members row after registration");

  // Real, attributable data in every module the sweep purges — seeded
  // directly (each module's own authoring UI is already covered by its own
  // e2e spec; this test's job is the purge, not re-proving authoring).
  const fixture = await seedAccountDeletionFixture(userId, memberId);

  await page.goto("/account/einstellungen");
  await page.getByRole("button", { name: "Konto löschen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ja, endgültig löschen" }).click();
  await page.waitForURL("**/konto-loeschung-angefragt");

  // The lock takes effect — same assertion shape as the reactivation test.
  await page.goto("/account/einstellungen");
  await expect(page).toHaveURL(/\/anmelden/);

  // Stand in for the real 30-day wait.
  await backdateDeletionRequest(userId, 1);

  // Wire the two true externals + both member-id resolvers this test's own
  // Node process needs — the app server's own boot never reaches this
  // process (see Global Constraints).
  function memoryBucket(keys: string[]) {
    const objects = new Set(keys);
    return {
      objects,
      async deleteByPrefix(prefix: string): Promise<{ deleted: number }> {
        let deleted = 0;
        for (const k of [...objects]) {
          if (k.startsWith(prefix)) {
            objects.delete(k);
            deleted++;
          }
        }
        return { deleted };
      },
      async deleteObject(key: string): Promise<void> {
        objects.delete(key);
      },
    };
  }
  const filesBucket = memoryBucket([fixture.fileStorageKey]);
  const blogBucket = memoryBucket([fixture.blogMediaKey]);
  const profileBucket = memoryBucket([fixture.profileMediaKey]);
  setStorage(filesBucket as unknown as StorageClient);

  const resolver = { resolveMemberId: async () => memberId };
  setFilesMemberIdResolver(resolver as never);
  setNotificationsMemberIdResolver(resolver as never);

  const sent: OutboundEmail[] = [];
  setNotifier({
    async send(mail) {
      sent.push(mail);
    },
  });

  const result = await runAccountDeletionSweep(getDb(), {
    steps: buildDeletionSteps({
      blogMedia: () => blogBucket as never,
      profileMedia: () => profileBucket as never,
    }),
    completionMail,
  });

  // Assert on this request specifically, not the sweep's aggregate counts —
  // see Review Focus.
  expect(result.failed).toEqual([]);
  expect(await authUserExists(email)).toBe(false);
  expect([...filesBucket.objects]).toEqual([]);
  expect([...blogBucket.objects]).toEqual([]);
  expect([...profileBucket.objects]).toEqual([]);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.to).toBe(email);

  // Genuinely gone, not merely still pending — the generic message, not the
  // pending-deletion-specific one (login.ts:74-87).
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("E-Mail oder Passwort ungültig.")).toBeVisible();
  await expect(page.getByText(/Löschung vorgemerkt/)).toHaveCount(0);
});
```

- [ ] **Step 3: Run it and see where it actually breaks**

```bash
pnpm db:up
pnpm db:migrate
pnpm --filter @bdas/web build
pnpm e2e -g "purges the account across every module"
```

Expected first failure is informative, not infrastructural: most likely a selector mismatch or an import path issue (the cross-boundary import of `apps/web/lib/account-deletion-composition.ts` from `e2e/` is new — if the Playwright test runner's TS transform can't resolve it, inline the five-step list and `completionMail` logic directly in the test file instead, copying `apps/web/lib/account-deletion-composition.ts` verbatim, and note the duplication risk in a comment). PR8's production code is unchanged and already shipped, so a failure here is in the test's own wiring, not in the feature.

- [ ] **Step 4: Fix until green**

Iterate on Step 2's code against the actual failure from Step 3. Common candidates, in order of likelihood: the dialog button's accessible name, the `/konto-loeschung-angefragt` redirect timing, a missing `NOT NULL` column in one of the fixture inserts (check against the live schema with `\d posts` / `\d events` / `\d files` / `\d notification_log` if an insert 500s), or the resolver's return type not matching `MemberIdResolver`'s interface shape.

- [ ] **Step 5: Run again to confirm green**

```bash
pnpm e2e -g "purges the account across every module"
```

Expected: 1 passed.

- [ ] **Step 6: Run the full e2e suite once**

```bash
pnpm e2e
```

Expected: no new failures — confirms the new test's `setStorage`/`setNotifier`/`setMemberIdResolver` calls (module-level in the test process) don't leak into any other spec in the same serial run.

- [ ] **Step 7: Commit**

```bash
git add e2e/account-deletion.e2e.ts
git commit -m "test(e2e): prove the account-deletion sweep purges every module and sends e-mail C"
```

---

## After both tasks: PR

One PR, title e.g. `test(e2e): account-deletion overall journey (PR9)`. This is the last PR in the account-deletion series — `/code-review` per CLAUDE.md §4; `/security-review` is optional here (no new production code, per CLAUDE.md's own trigger list of auth/payments/files PRs, but reasonable to run anyway since the test exercises real deletion). `account_deletion` stays off in production regardless — the three remaining hard go-live prerequisites (storage staging dry-run, export gaps, PII-retention follow-up PR, and the pending "Sperren statt Löschen" legal clarification) are unaffected by this PR and still gate the flag (memory `account-deletion-pr-sequence`).
