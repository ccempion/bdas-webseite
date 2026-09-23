# Konto-Löschung — PR6: Events-Modul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `events` its purge/export contribution to the account-deletion sweep: `clearOrganizerForUser(db, userId)` (the event survives — it's institutional club history, not personal expression — only the organizer reference is cleared) and `exportForUser(db, userId)` (Art. 15, the events the member organized). No orchestrator wiring, no cron, no UI — those are PR3/PR8 territory (already built / not yet built).

**Architecture:** `events` owns `events`/`event_registrations`/`event_attendance` (Rule 1). `events.created_by` is a plain auth-user id with no FK (same shape as `blog`'s `posts.created_by`) — this PR needs no `MemberIdResolver`, matching PR5's blog module rather than PR4's files module. `event_registrations.member_id`/`event_attendance.member_id` ARE keyed by `members.id` with `ON DELETE CASCADE` — but per the design spec, those are already handled for free by the final `auth.deleteAccount()` cascade (step 5 of the sweep) once a member row is deleted. This PR's code does not touch either table.

**Migration — corrects the initial framing (confirmed with the user 2026-09-23):** `events.created_by` is declared `text NOT NULL` in both `migrations/0001_init.sql:18` and `schema.ts:42`, with no later migration relaxing it. Clearing the organizer reference to `NULL` is therefore not possible without a migration — this PR needs one, contrary to the original "no migration" framing. Small and low-risk (a single `ALTER TABLE events ALTER COLUMN created_by DROP NOT NULL;`, the same shape as PR4's `file_access_log` migration), and confirmed to ripple safely: `canManage`'s `event.createdBy === v.userId` check (`services/get.ts:57`) and `list.ts`'s `eq(events.createdBy, viewer.userId)` organizer filter both already compare against a possibly-narrower `string`, and neither breaks when the column can hold `NULL` — a `NULL` organizer simply never matches any viewer's id, which is exactly the intended "no one can manage via the organizer path anymore" outcome. No `apps/web` UI renders `event.createdBy` directly (checked — no hits), so there's no display-layer fallback to add either.

**Export scope — confirmed with the user 2026-09-23:** `exportForUser` returns only the events the member organized (`created_by = userId`), the same scope `clearOrganizerForUser` touches — no `MemberIdResolver` needed. It deliberately does **not** include the member's own event registrations/attendance (`event_registrations`/`event_attendance`, keyed by `members.id`) — including those would need a resolver, growing this PR to files-module size. **Hard requirement for PR7 (export completion):** the user explicitly requires the member's own registrations/attendance to be added to the Art. 15 export there — PR7 already needs a resolver and does the CSV/ZIP bundling, so it's the natural place. Do not let PR7's plan skip this.

**Tech Stack:** TypeScript, Drizzle ORM (raw SQL migrations are authoritative; `schema.ts` mirrors them), Vitest + real Postgres (Docker) for integration tests, `@bdas/errors`, `@bdas/id`.

**Spec:** `docs/superpowers/specs/2026-09-22-account-deletion-design.md` — this plan implements the `events`-owned half of §5 step 3 (`events.clearOrganizerForUser`) and the `events` slice of §6 (`exportForUser`, scoped per the confirmed decision above).

## Global Constraints

- Rule 1 (CLAUDE.md §1): `modules/events/src/**` never imports `@bdas/members`/`@bdas/auth` — it already doesn't (`services/manage.ts`'s own header: "This keeps `events` free of an `auth`/`members` dependency"), and this PR must not change that.
- Rule 5: integration tests run against real Postgres (Docker), never mocked. Use `describeIfDb`, matching every other test file in this module. No resolver, no storage — there is nothing to fake in this PR.
- Rule 7: the new migration is `modules/events/migrations/0004_organizer_erasure.sql`, runnable in isolation, filename-ordered after `0003_guest_registration.sql`. No `infra/migrations/manifest.ts` change needed (`events` is already in the manifest; files within a module run in filename order).
- Rule 8: only symbols re-exported from `modules/events/src/index.ts` are public.
- Test-file placement follows this module's existing convention: test files sit flat in `modules/events/src/` (e.g. `index.test.ts`, `get.test.ts`, `list.test.ts`), not alongside their service file in `services/`. This PR's new test file is `modules/events/src/gdpr.test.ts`, testing `services/gdpr.ts`.
- `clearOrganizerForUser` and `exportForUser` are idempotent / safe with nothing to do: unlike `files`/`notifications`, there's no resolver step that can fail to resolve, so idempotency here just means "a second call finds nothing left to clear/export" — that falls out of `UPDATE/SELECT ... WHERE createdBy = userId` matching zero rows.
- Per user memory: run `pnpm format` before every commit.
- This PR does not touch the orchestrator, the cron sweep, or any route (PR8, not yet built). `clearOrganizerForUser`/`exportForUser` are built and exported but not called from anywhere yet — same "foundation only" shape PR4/PR5 used.
- `/security-review` runs on this PR before it's considered done, per explicit user instruction — no surprises expected (no hard delete, no migration touching irreversible data, only clearing a reference), but the review still runs.

---

### Task 1: `created_by` erasure migration

**Files:**

- Create: `modules/events/migrations/0004_organizer_erasure.sql`
- Modify: `modules/events/src/schema.ts`
- Modify: `modules/events/src/types.ts`
- Test: `modules/events/src/index.test.ts` (new test in the existing `describeIfDb("events", ...)` block — check the exact `describeIfDb(...)` name used in that file's top-level call before writing the test, since it must go inside the same block, not a new one)

**Interfaces:**

- Produces: `events.createdBy` becomes `string | null` in the Drizzle-inferred row type and in the public `EventItem` type (was `string` in both).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

First, add `"0004_organizer_erasure.sql"` to `modules/events/src/index.test.ts`'s migration-loading list (after `"0003_guest_registration.sql"`, inside whichever `beforeEach`/`applyMigrations`-equivalent block loads the module's own migrations — read the existing block at the top of the `describeIfDb` call to match its exact structure, it directly follows the auth/groups/members entries already there).

Then add this test inside the existing `describeIfDb(...)` block, near the other schema-level assertions (or as a standalone `it` near the top of the block if there's no dedicated schema sub-block):

```ts
it("allows created_by to be cleared to NULL", async () => {
  const ev = await createEvent(t.db, { title: "Wird verwaist", startsAt: future() }, "usr_gone");

  await t.client`UPDATE events SET created_by = NULL WHERE id = ${ev.id}`;

  const rows = await t.client`SELECT created_by FROM events WHERE id = ${ev.id}`;
  expect(rows[0]?.["created_by"]).toBeNull();
});
```

(`createEvent` and `future` are already imported/defined in this file — no new imports needed for this step.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/events-module test index`
Expected: FAIL — Postgres rejects the `UPDATE ... SET created_by = NULL` with a `NOT NULL constraint` violation (the migration doesn't exist yet, so the column is still `NOT NULL`).

- [ ] **Step 3: Write the migration**

Create `modules/events/migrations/0004_organizer_erasure.sql`:

```sql
-- Self-service account deletion (DSGVO Art. 17). Events are institutional
-- club history, not personal expression — the event itself survives a
-- deletion; only the organizer reference is cleared. See design spec §5
-- step 3 and docs/superpowers/specs/2026-09-22-account-deletion-design.md.
--
-- created_by was NOT NULL since 0001_init.sql, with no way to represent "the
-- organizer's account no longer exists" without this.

ALTER TABLE events ALTER COLUMN created_by DROP NOT NULL;
```

- [ ] **Step 4: Update `schema.ts`**

In `modules/events/src/schema.ts`, change:

```ts
    createdBy: text("created_by").notNull(),
```

to:

```ts
    createdBy: text("created_by"),
```

- [ ] **Step 5: Update `types.ts`**

In `modules/events/src/types.ts`, in the `EventItem` type, change:

```ts
  readonly createdBy: string;
```

to:

```ts
  readonly createdBy: string | null;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @bdas/events-module test index`
Expected: PASS. If the DB is unreachable, start it first: `pnpm db:up`.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @bdas/events-module typecheck`
Expected: no errors. (`rowToEvent` in `manage.ts` does a direct `createdBy: r.createdBy` passthrough — it needs no code change, the wider type flows through automatically. `canManage`/`list.ts`'s organizer filter also need no change — confirmed safe in this plan's Architecture section above. If typecheck surfaces anything unexpected here, stop and report it rather than guessing a fix — the plan's analysis said this should be silent.)

- [ ] **Step 8: Commit**

```bash
pnpm format
git add modules/events/migrations/0004_organizer_erasure.sql modules/events/src/schema.ts modules/events/src/types.ts modules/events/src/index.test.ts
git commit -m "fix(events): allow created_by to be cleared for account deletion

events.created_by was NOT NULL since the initial migration, with no way to
represent an organizer whose account no longer exists. Events are
institutional club history (spec §5 step 3) — they survive a deletion,
only the organizer reference needs to become clearable.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `clearOrganizerForUser` + `exportForUser`

**Files:**

- Create: `modules/events/src/services/gdpr.ts`
- Create: `modules/events/src/gdpr.test.ts`

**Interfaces:**

- Consumes: `events` from `../schema`; `EventItem` from `../types`; `rowToEvent` from `./manage` (already exported, not currently re-exported via `index.ts` — that's fine, this file imports it directly as a sibling module file).
- Produces:
  - `clearOrganizerForUser(db: Db, userId: string): Promise<void>`
  - `exportForUser(db: Db, userId: string): Promise<readonly EventItem[]>`

This is one TDD cycle covering both functions together — same file, same "no resolver needed" rationale, same test fixtures.

- [ ] **Step 1: Write the failing test file**

Create `modules/events/src/gdpr.test.ts`:

```ts
/**
 * Integration tests for this module's GDPR functions (exportForUser,
 * clearOrganizerForUser) against a real Postgres schema. Skips when
 * DATABASE_URL is unreachable, matching every other test file in this
 * module.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";

import { clearOrganizerForUser, exportForUser } from "./services/gdpr";
import { createEvent } from "./services/manage";

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

function future(daysAhead = 7): Date {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
}

describeIfDb("events GDPR functions", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "migrations", "0001_init.sql"],
      ["..", "migrations", "0002_event_pages.sql"],
      ["..", "migrations", "0003_guest_registration.sql"],
      ["..", "migrations", "0004_organizer_erasure.sql"],
    ]) {
      const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
      await t.client.unsafe(sql);
    }
  });

  afterEach(async () => {
    await t.cleanup();
  });

  describe("exportForUser", () => {
    it("returns every event the user organized", async () => {
      const a = await createEvent(t.db, { title: "Erstes", startsAt: future() }, "usr_departing");
      const b = await createEvent(
        t.db,
        { title: "Zweites", startsAt: future(14) },
        "usr_departing",
      );
      await createEvent(t.db, { title: "Fremd", startsAt: future() }, "usr_other");

      const result = await exportForUser(t.db, "usr_departing");

      expect(result.map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
    });

    it("returns an empty array for a user who organized nothing", async () => {
      expect(await exportForUser(t.db, "usr_nobody")).toEqual([]);
    });
  });

  describe("clearOrganizerForUser", () => {
    it("clears created_by on every event the user organized, event rows survive", async () => {
      const ev = await createEvent(
        t.db,
        { title: "Bleibt bestehen", startsAt: future() },
        "usr_departing",
      );

      await clearOrganizerForUser(t.db, "usr_departing");

      const [row] = await t.client`SELECT created_by FROM events WHERE id = ${ev.id}`;
      expect(row).toBeDefined();
      expect(row?.["created_by"]).toBeNull();
    });

    it("never touches an event organized by someone else", async () => {
      const otherEvent = await createEvent(
        t.db,
        { title: "Fremdes Event", startsAt: future() },
        "usr_other",
      );

      await clearOrganizerForUser(t.db, "usr_departing"); // usr_departing organized nothing here

      const [row] = await t.client`SELECT created_by FROM events WHERE id = ${otherEvent.id}`;
      expect(row?.["created_by"]).toBe("usr_other");
    });

    it("is idempotent: a second call after clearing is a clean no-op", async () => {
      const ev = await createEvent(
        t.db,
        { title: "Einmal reicht", startsAt: future() },
        "usr_departing",
      );

      await clearOrganizerForUser(t.db, "usr_departing");
      await expect(clearOrganizerForUser(t.db, "usr_departing")).resolves.toBeUndefined();

      const [row] = await t.client`SELECT created_by FROM events WHERE id = ${ev.id}`;
      expect(row?.["created_by"]).toBeNull();
    });

    it("is a no-op for a user who organized nothing", async () => {
      await expect(clearOrganizerForUser(t.db, "usr_nobody")).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/events-module test gdpr`
Expected: FAIL — `./services/gdpr` does not exist.

- [ ] **Step 3: Write `gdpr.ts`**

Create `modules/events/src/services/gdpr.ts`:

```ts
/**
 * This module's GDPR self-service contributions (Art. 15 export, Art. 17
 * purge) for the account-deletion feature. `events.created_by` is a plain
 * auth-user id with no FK (same shape as blog's `posts.created_by`) — this
 * module needs no MemberIdResolver, unlike `files`/`notifications`.
 *
 * Events survive account deletion — they're institutional club history, not
 * personal expression the way a blog post is (design spec §5 step 3). Only
 * the organizer reference is cleared, never the event row itself.
 *
 * `event_registrations`/`event_attendance` are NOT touched here: both are
 * keyed by `members.id` with `ON DELETE CASCADE`, so they're already removed
 * for free by the final `auth.deleteAccount()` cascade once the member row
 * goes. Their export (the member's own registrations/attendance history) is
 * NOT covered by `exportForUser` below either — that needs a resolver
 * (`members.id`, not the plain `userId` this module otherwise uses) and is a
 * confirmed requirement for PR7 (export completion), not this PR.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { events } from "../schema";
import type { EventItem } from "../types";
import { rowToEvent } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Art. 15 — this module's slice of a user's full data export: every event
 * they organized. Does not include registrations/attendance as a
 * participant (see module docstring above — that's PR7's job).
 */
export async function exportForUser(db: Db, userId: string): Promise<readonly EventItem[]> {
  const rows = await db.select().from(events).where(eq(events.createdBy, userId));
  return rows.map(rowToEvent);
}

/**
 * Art. 17 purge step, run by the account-deletion orchestrator (a later
 * PR). Clears the organizer reference on every event this user organized —
 * the events themselves are never deleted or modified beyond this one
 * column.
 */
export async function clearOrganizerForUser(db: Db, userId: string): Promise<void> {
  await db.update(events).set({ createdBy: null }).where(eq(events.createdBy, userId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/events-module test gdpr`
Expected: PASS (all cases). If the DB is unreachable: `pnpm db:up`.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter @bdas/events-module typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add modules/events/src/services/gdpr.ts modules/events/src/gdpr.test.ts
git commit -m "feat(events): add exportForUser/clearOrganizerForUser (DSGVO Art. 15/17)

clearOrganizerForUser clears the organizer reference on every event this
user organized — the event itself always survives, it's institutional club
history per design spec §5 step 3, not personal expression. exportForUser
returns the events the user organized, reusing the module's existing
EventItem type and rowToEvent mapper. No MemberIdResolver needed — this
module already keys events by the plain auth user id.

Registrations/attendance as a participant are explicitly out of scope here
(keyed by members.id, already cascade-deleted for free by the final
auth.deleteAccount() call; their export is a confirmed PR7 requirement).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Public exports + full verification

**Files:**

- Modify: `modules/events/src/index.ts`

**Interfaces:**

- Produces: `clearOrganizerForUser`, `exportForUser` — now part of `@bdas/events-module`'s public surface (Rule 8).

- [ ] **Step 1: Add the service exports**

In `modules/events/src/index.ts`, after the existing `export { countAttendedEvents, listMyUpcomingRegistrations } from "./services/mine";` line, add:

```ts
export { clearOrganizerForUser, exportForUser } from "./services/gdpr";
```

- [ ] **Step 2: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: no errors (confirms nothing outside `events` broke and the new exports resolve — this is also where any unexpected fallout from `EventItem.createdBy` becoming nullable would surface, beyond what this plan's Architecture section already verified).

- [ ] **Step 3: Run the full test suite**

Run: `pnpm db:up && pnpm test`
Expected: all suites pass, including the new `gdpr.test.ts` and the extended `index.test.ts`.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add modules/events/src/index.ts
git commit -m "feat(events): export account-deletion purge/export surface

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Self-Review

- **Spec coverage:** implements the `events`-owned half of design spec §5 step 3 (`clearOrganizerForUser`) and the `events` slice of §6 (`exportForUser`, scoped per the confirmed decision above). Orchestrator wiring is out of scope by design (PR8 not yet built). ✓
- **Placeholder scan:** none — every step has full code, no TBD/TODO. ✓
- **Type consistency:** `clearOrganizerForUser`/`exportForUser` signatures match across `gdpr.ts`, `gdpr.test.ts`'s imports, and `index.ts`'s re-export. `EventItem.createdBy: string | null` matches the widened `schema.ts` column and is used consistently — `rowToEvent`'s passthrough needs no change, confirmed by tracing its exact code in Task 1. ✓
- **Rule 1 boundary:** confirmed no file in `modules/events/src/**` imports `@bdas/members`/`@bdas/auth` — this PR adds none. ✓
- **Migration safety:** confirmed `canManage` (`services/get.ts:57`) and `list.ts`'s organizer filter both remain correct with a nullable `createdBy` — a `NULL` organizer matches no viewer's id, which is exactly the intended behavior, not an edge case needing special handling. Confirmed no `apps/web` code renders `event.createdBy` directly (no display fallback needed). ✓
- **Blast-radius safety:** `clearOrganizerForUser` only ever touches rows matching `created_by = userId` via a single-column `eq()` predicate — there is no foreign-content risk analogous to PR4's folders or PR5's cascading comments, since the event row itself is never deleted or otherwise modified. Still covered by a dedicated "never touches an event organized by someone else" test, matching this PR series' established pattern for destructive/mutating account-deletion code. ✓
- **PR7 requirement recorded:** the confirmed gap (registrations/attendance export) is stated in this plan's Architecture section, to be additionally carried into the ledger and the `account-deletion-pr-sequence` memory file during execution, per the user's explicit instruction that it must be a hard requirement, not a loose note. ✓
- **Scope:** no orchestrator, no cron route, no other module touched, no MemberIdResolver — matches "PR6: Events" in the confirmed PR sequence (PR1 auth, PR2 notifications, PR3 deletion UI, PR4 files, PR5 blog, **PR6 events**, PR7 export completion, PR8 orchestrator/cron). ✓

Plan complete and saved to `docs/superpowers/plans/2026-09-23-account-deletion-pr6-events.md`.

Per your instruction: **Subagent-Driven** execution, mostly continuous — one checkpoint when Task 2's tests exist (the boundary tests proving `clearOrganizerForUser` never touches another organizer's event), then continue through Task 3, the final whole-branch review, and **`/security-review`** without further per-task stops.

Ready to start Task 1?
