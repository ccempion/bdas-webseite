# Membership Application Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a membership application a `NULL → group` row in `member_group_change_requests`, so that `members.primary_group_id` is set only once a board has accepted the person — which is what lets a rejection carry a reason, drop the applicant out of the group's member list, and leave them free to apply again.

**Architecture:** Three sequential phases. Phase 1 adds capability to the `members` module without removing the old status-based join path, so it ships inert. Phase 2 builds the board surfaces and switches the app over, deleting what it replaced. Phase 3 builds the applicant surface and removes the now-unreachable module branches. Each phase compiles and ships on its own.

**Tech Stack:** TypeScript, Next.js 14 App Router, Drizzle ORM on PostgreSQL, Vitest with Docker Postgres, Tailwind via `@bdas/design-system`, pnpm workspaces.

**Source spec:** `docs/superpowers/specs/2026-07-27-membership-application-lifecycle-design.md`
**Decision record:** `docs/decisions/0031-applications-are-group-requests.md`

## Global Constraints

- **Module boundaries (CLAUDE.md §1).** `members` owns `members`, `member_role_grants`, `member_group_change_requests`. It must never read the `groups` table — group status checks belong in the app layer.
- **Public surface.** Only symbols re-exported from `modules/members/src/index.ts` are importable elsewhere. No deep imports.
- **Migrations.** Live in `modules/members/migrations/`, run in manifest order from `infra/migrations/src/manifest.ts`. Register every new file in `MEMBERS_TEST_MIGRATIONS` in `modules/members/src/test-db.ts` too, or the tests run against a stale schema.
- **No database mocks.** Integration tests run against Docker Postgres via `setupMembersDb()`. Tests are skipped, not failed, when the database is unreachable (`dbReachable()`).
- **Design tokens.** No inline hex, radius, shadow or duration values. Consume `@bdas/design-system`.
- **UI copy is German.** Reason category keys are stable English identifiers; only their labels are German.
- **Rejection reason categories** are exactly `no_contact`, `not_a_student`, `other`. `other` requires a message.
- **Applications may target `active` and `dormant` groups only.** `new` and `archived` are excluded.
- **Never show the applicant who decided.** `decided_by` is audit data.
- **Deployment is expand/contract, in three ordered steps.** Vercel does not run migrations; they are applied by hand and are decoupled from deploys, so no step may assume another has already happened.
  1. Apply `0008` (columns + data backfill, no reason-required constraint). Safe against the currently-deployed code.
  2. Deploy the code that always writes a reason on rejection.
  3. Apply `0009` (the reason-required constraint). Only now can it be satisfied.

  Each step needs its own `_bdas_migrations` insert. Applying `0009` before step 2 breaks every rejection in the live app with a constraint violation — that is why the constraint is a separate file.

---

# Phase 1 — Module (additive, nothing user-visible)

## Task 1: Migration — reason columns and data backfill

**Files:**
- Create: `modules/members/migrations/0008_application_reasons.sql`
- Modify: `modules/members/src/test-db.ts:16-26` (append to `MEMBERS_TEST_MIGRATIONS`)
- Modify: `modules/members/src/test-db.ts:62-67` (`createGroup` gains a status parameter)
- Test: `modules/members/src/application-migration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: columns `reason_category TEXT` and `reason_message TEXT` on `member_group_change_requests`; a schema where no `pending` member has a `primary_group_id`.

- [ ] **Step 1: Write the migration**

Create `modules/members/migrations/0008_application_reasons.sql`:

```sql
-- Members module — application reasons and the groupless invariant (ADR 0031).
--
-- A membership application becomes a `NULL -> group` request row, so
-- `members.primary_group_id` is set only once a board has accepted the person.
-- Rejection records a reason on the request rather than flipping member status.

-- 1. The reason columns.
ALTER TABLE member_group_change_requests
  ADD COLUMN reason_category TEXT,
  ADD COLUMN reason_message  TEXT;

-- 2. Existing rejected transfers predate the reason requirement. Backfill them
--    before the constraint lands, or the constraint cannot be added.
UPDATE member_group_change_requests
   SET reason_category = 'other',
       reason_message  = 'Grund wurde vor Einführung der Begründungspflicht nicht erfasst.'
 WHERE status = 'rejected'
   AND reason_category IS NULL;

-- 3. The reason is one of the three keys, and `other` must say something.
--
--    The constraint that a rejection MUST carry a reason lives in 0009, not
--    here: it would reject writes from the currently-deployed code, which does
--    not set one yet. Both constraints below are satisfied by a NULL category,
--    so they are safe against the old code and can land now.
ALTER TABLE member_group_change_requests
  ADD CONSTRAINT member_group_change_requests_reason_category_check
    CHECK (reason_category IS NULL
           OR reason_category IN ('no_contact', 'not_a_student', 'other'));

ALTER TABLE member_group_change_requests
  ADD CONSTRAINT member_group_change_requests_reason_other_check
    CHECK (reason_category IS DISTINCT FROM 'other' OR reason_message IS NOT NULL);

-- 4. Live applications: a pending member's group choice was never approved by
--    anyone, so it becomes a pending request and the column is cleared. The
--    original signup time is kept so nobody loses their place in the queue.
INSERT INTO member_group_change_requests
  (id, member_id, from_group_id, to_group_id, status, requested_at)
SELECT 'mgc_mig_' || m.id, m.id, NULL, m.primary_group_id, 'pending', m.created_at
  FROM members m
 WHERE m.status = 'pending'
   AND m.primary_group_id IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM member_group_change_requests r
          WHERE r.member_id = m.id AND r.status = 'pending'
       );

UPDATE members
   SET primary_group_id = NULL, updated_at = now()
 WHERE status = 'pending'
   AND primary_group_id IS NOT NULL;

-- 5. Rejected applicants. `joined_at` is stamped only on first acceptance, so
--    `inactive` with a null `joined_at` is someone who was refused and never was
--    a member. They are currently stranded: `inactive` only transitions to
--    `active`, and they may not apply anywhere. Return them to the pool and
--    record what happened to them.
INSERT INTO member_group_change_requests
  (id, member_id, from_group_id, to_group_id, status,
   requested_at, decided_at, decided_by, reason_category, reason_message)
SELECT 'mgc_rej_' || m.id, m.id, NULL, m.primary_group_id, 'rejected',
       m.created_at, m.updated_at, 'system', 'other',
       'Diese Entscheidung stammt aus der Zeit vor der Begründungspflicht.'
  FROM members m
 WHERE m.status = 'inactive'
   AND m.joined_at IS NULL
   AND m.primary_group_id IS NOT NULL;

UPDATE members
   SET status = 'pending', primary_group_id = NULL, updated_at = now()
 WHERE status = 'inactive'
   AND joined_at IS NULL;
```

- [ ] **Step 2: Register the migration in the test harness**

In `modules/members/src/test-db.ts`, append to `MEMBERS_TEST_MIGRATIONS` after the `0007_page_editor.sql` entry:

```ts
  ["..", "migrations", "0008_application_reasons.sql"],
```

In the same file, replace `createGroup` so tests can create non-active groups:

```ts
export async function createGroup(
  t: TestDb,
  id: string,
  slug: string,
  status: "active" | "dormant" | "new" | "archived" = "active",
): Promise<void> {
  await t.client`
    INSERT INTO groups (id, slug, name, city, status)
    VALUES (${id}, ${slug}, ${slug}, 'Teststadt', ${status})
  `;
}
```

- [ ] **Step 3: Write the failing migration test**

Create `modules/members/src/application-migration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

/**
 * The migration runs as part of setupMembersDb, so a fixture inserted here is
 * already migrated. To test the migration itself we insert the pre-migration
 * shapes, then re-run only the data steps — which are idempotent by
 * construction (NOT EXISTS guard, and the UPDATEs are no-ops once applied).
 */
describeIfDb("0008 application reasons — data migration", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupMembersDb();
    await createGroup(t, "grp_a", "aachen");
    for (const [id, email] of [
      ["usr_p", "p@example.de"],
      ["usr_r", "r@example.de"],
      ["usr_f", "f@example.de"],
      ["usr_a", "a@example.de"],
    ]) {
      await createUser(t, id!, email!);
    }
    // pending applicant with a group nobody approved
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_p', 'usr_p', 'Pia', 'Pending', 'grp_a', 'pending')
    `;
    // rejected applicant: inactive, never joined
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_r', 'usr_r', 'Rea', 'Rejected', 'grp_a', 'inactive', NULL)
    `;
    // genuine former member: inactive, but did join once
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_f', 'usr_f', 'Fred', 'Former', 'grp_a', 'inactive', now())
    `;
    // ordinary active member
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_a', 'usr_a', 'Ada', 'Active', 'grp_a', 'active', now())
    `;
    await runDataSteps(t);
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("turns a pending member's group choice into a pending request", async () => {
    const [member] = await t.client`SELECT primary_group_id FROM members WHERE id = 'mem_p'`;
    expect(member!["primary_group_id"]).toBeNull();

    const rows = await t.client`
      SELECT to_group_id, status FROM member_group_change_requests WHERE member_id = 'mem_p'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!["to_group_id"]).toBe("grp_a");
    expect(rows[0]!["status"]).toBe("pending");
  });

  it("returns a rejected applicant to the pool with a rejection on record", async () => {
    const [member] = await t.client`
      SELECT status, primary_group_id FROM members WHERE id = 'mem_r'
    `;
    expect(member!["status"]).toBe("pending");
    expect(member!["primary_group_id"]).toBeNull();

    const rows = await t.client`
      SELECT status, to_group_id, reason_category
        FROM member_group_change_requests WHERE member_id = 'mem_r'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!["status"]).toBe("rejected");
    expect(rows[0]!["to_group_id"]).toBe("grp_a");
    expect(rows[0]!["reason_category"]).toBe("other");
  });

  it("leaves a genuine former member untouched", async () => {
    const [member] = await t.client`
      SELECT status, primary_group_id FROM members WHERE id = 'mem_f'
    `;
    expect(member!["status"]).toBe("inactive");
    expect(member!["primary_group_id"]).toBe("grp_a");
  });

  it("leaves an active member untouched", async () => {
    const [member] = await t.client`
      SELECT status, primary_group_id FROM members WHERE id = 'mem_a'
    `;
    expect(member!["status"]).toBe("active");
    expect(member!["primary_group_id"]).toBe("grp_a");
  });

  it("never leaves a pending member holding an unapproved group", async () => {
    const rows = await t.client`
      SELECT id FROM members WHERE status = 'pending' AND primary_group_id IS NOT NULL
    `;
    expect(rows).toHaveLength(0);
  });

  it("is idempotent — a second run inserts no duplicate request", async () => {
    await runDataSteps(t);
    const rows = await t.client`
      SELECT id FROM member_group_change_requests WHERE member_id = 'mem_p'
    `;
    expect(rows).toHaveLength(1);
  });
});

/** Steps 4 and 5 of the migration, replayed against the fixture. */
async function runDataSteps(t: TestDb): Promise<void> {
  await t.client.unsafe(`
    INSERT INTO member_group_change_requests
      (id, member_id, from_group_id, to_group_id, status, requested_at)
    SELECT 'mgc_mig_' || m.id, m.id, NULL, m.primary_group_id, 'pending', m.created_at
      FROM members m
     WHERE m.status = 'pending'
       AND m.primary_group_id IS NOT NULL
       AND NOT EXISTS (
             SELECT 1 FROM member_group_change_requests r
              WHERE r.member_id = m.id AND r.status = 'pending'
           );

    UPDATE members SET primary_group_id = NULL, updated_at = now()
     WHERE status = 'pending' AND primary_group_id IS NOT NULL;

    INSERT INTO member_group_change_requests
      (id, member_id, from_group_id, to_group_id, status,
       requested_at, decided_at, decided_by, reason_category, reason_message)
    SELECT 'mgc_rej_' || m.id, m.id, NULL, m.primary_group_id, 'rejected',
           m.created_at, m.updated_at, 'system', 'other',
           'Diese Entscheidung stammt aus der Zeit vor der Begründungspflicht.'
      FROM members m
     WHERE m.status = 'inactive' AND m.joined_at IS NULL AND m.primary_group_id IS NOT NULL;

    UPDATE members SET status = 'pending', primary_group_id = NULL, updated_at = now()
     WHERE status = 'inactive' AND joined_at IS NULL;
  `);
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run modules/members/src/application-migration.test.ts`

Expected: FAIL — `column "reason_category" does not exist`, because the harness has not yet loaded `0008`. If instead every test is skipped, Docker Postgres is not running; start it with `docker compose up -d` and re-run.

- [ ] **Step 5: Run the test to verify it passes**

The migration and harness registration were written in steps 1 and 2, so this run should now be green.

Run: `pnpm vitest run modules/members/src/application-migration.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Verify the existing members suite still passes**

Run: `pnpm vitest run modules/members`
Expected: PASS. The `group-change.test.ts` fixtures insert `active` members with groups, which the migration does not touch.

- [ ] **Step 7: Commit**

```bash
git add modules/members/migrations/0008_application_reasons.sql \
        modules/members/src/test-db.ts \
        modules/members/src/application-migration.test.ts
git commit -m "feat(members): add application reason columns and free stranded applicants

Rejected applicants are identifiable by joined_at IS NULL, which is
stamped only on first acceptance. They return to the pool as groupless
pending members with the rejection kept on record."
```

---

## Task 2: Record a reason on rejection, and refuse deactivated members

> **Execute Task 3 before this one.** This task's tests use a helper that files an application and expects a request back, which is the behaviour Task 3 introduces — run in the written order, every test here fails on the helper rather than on the code under test. Task 3 stands alone and needs nothing from this task.

**Files:**
- Modify: `modules/members/src/schema.ts:61-85` (two columns)
- Modify: `modules/members/src/types.ts` (add `RejectionReason`, extend `GroupChangeRequest`)
- Modify: `modules/members/src/services/group-change.ts:53-58` (`row2request`), `:257-320` (`decideGroupChange`)
- Modify: `modules/members/src/index.ts` (export `RejectionReason`)
- Test: `modules/members/src/group-change.test.ts` (append a describe block)

**Interfaces:**
- Consumes: the columns from Task 1.
- Produces:
  - `type RejectionReason = { readonly category: "no_contact" | "not_a_student" | "other"; readonly message: string | null }`
  - `decideGroupChange(db: Db, requestId: string, decision: "approved" | "rejected", actor: Actor, reason?: RejectionReason): Promise<GroupChangeRequest>`
  - `GroupChangeRequest` gains `readonly reasonCategory: string | null` and `readonly reasonMessage: string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `modules/members/src/group-change.test.ts`:

```ts
describeIfDb("rejection reasons", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
    await createUser(t, "usr_cem", "cem@example.de");
    await createUser(t, "usr_board", "board@example.de");
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_cem', 'usr_cem', 'Cem', 'Colak', NULL, 'pending')
    `;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_board', 'usr_board', 'Bea', 'Board', 'grp_b', 'active', now())
    `;
    await grantRole(t.db, "mem_board", "local_board", "grp_b", "usr_federal");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  const apply = async () => {
    const res = await changePrimaryGroup(t.db, "mem_cem", "grp_b", self("usr_cem"));
    if (res.kind !== "requested") throw new Error("expected a request");
    return res.request.id;
  };

  it("stores category and message on rejection", async () => {
    const id = await apply();
    const decided = await decideGroupChange(t.db, id, "rejected", boardOf("usr_board", "grp_b"), {
      category: "no_contact",
      message: "Wir haben dich dreimal nicht erreicht.",
    });
    expect(decided.status).toBe("rejected");
    expect(decided.reasonCategory).toBe("no_contact");
    expect(decided.reasonMessage).toBe("Wir haben dich dreimal nicht erreicht.");
  });

  it("leaves the member groupless and pending after a rejection", async () => {
    const id = await apply();
    await decideGroupChange(t.db, id, "rejected", boardOf("usr_board", "grp_b"), {
      category: "no_contact",
      message: null,
    });
    const member = await getMember(t.db, "mem_cem");
    expect(member?.status).toBe("pending");
    expect(member?.primaryGroupId).toBeNull();
  });

  it("lets a rejected applicant apply to the same group again", async () => {
    const first = await apply();
    await decideGroupChange(t.db, first, "rejected", boardOf("usr_board", "grp_b"), {
      category: "no_contact",
      message: null,
    });
    const again = await changePrimaryGroup(t.db, "mem_cem", "grp_b", self("usr_cem"));
    expect(again.kind).toBe("requested");
  });

  it("refuses a rejection with no reason", async () => {
    const id = await apply();
    await expect(
      decideGroupChange(t.db, id, "rejected", boardOf("usr_board", "grp_b")),
    ).rejects.toThrow(/Grund/);
  });

  it("refuses category 'other' with no message", async () => {
    const id = await apply();
    await expect(
      decideGroupChange(t.db, id, "rejected", boardOf("usr_board", "grp_b"), {
        category: "other",
        message: null,
      }),
    ).rejects.toThrow(/Nachricht/);
  });

  it("stores no reason on approval", async () => {
    const id = await apply();
    const decided = await decideGroupChange(t.db, id, "approved", boardOf("usr_board", "grp_b"));
    expect(decided.reasonCategory).toBeNull();
  });

  it("refuses to decide a request whose member was deactivated", async () => {
    const id = await apply();
    await t.client`UPDATE members SET status = 'inactive' WHERE id = 'mem_cem'`;
    await expect(
      decideGroupChange(t.db, id, "approved", boardOf("usr_board", "grp_b")),
    ).rejects.toThrow(/nicht mehr/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run modules/members/src/group-change.test.ts -t "rejection reasons"`
Expected: FAIL — `decideGroupChange` takes four arguments, and `reasonCategory` is not on the returned object.

- [ ] **Step 3: Add the columns to the Drizzle schema**

In `modules/members/src/schema.ts`, inside the `memberGroupChangeRequests` column block, after `decidedBy`:

```ts
    reasonCategory: text("reason_category"),
    reasonMessage: text("reason_message"),
```

- [ ] **Step 4: Add the types**

In `modules/members/src/types.ts`, add above `GroupChangeRequest`:

```ts
/** The fixed reason keys a board may pick when rejecting. `other` needs a message. */
export type RejectionCategory = "no_contact" | "not_a_student" | "other";

export type RejectionReason = {
  readonly category: RejectionCategory;
  readonly message: string | null;
};

/**
 * German labels for the reason keys. They live here, in the module that owns the
 * column, because both the board's dropdown and the notifications module render
 * them — and neither may import the other.
 */
export const REJECTION_CATEGORY_LABELS: Record<RejectionCategory, string> = {
  no_contact: "Kein Kontakt zustande gekommen",
  not_a_student: "Kein Student mehr",
  other: "Sonstiges",
};
```

and add to the `GroupChangeRequest` type body:

```ts
  readonly reasonCategory: RejectionCategory | null;
  readonly reasonMessage: string | null;
```

- [ ] **Step 5: Carry the columns through `row2request`**

In `modules/members/src/services/group-change.ts`, extend the returned object in `row2request`:

```ts
    reasonCategory: r.reasonCategory as RejectionCategory | null,
    reasonMessage: r.reasonMessage,
```

Add `RejectionCategory` and `RejectionReason` to the existing `import type { ... } from "../types";` block.

- [ ] **Step 6: Validate and persist the reason in `decideGroupChange`**

In `modules/members/src/services/group-change.ts`, change the signature and body of `decideGroupChange`. Replace the parameter list:

```ts
export async function decideGroupChange(
  db: Db,
  requestId: string,
  decision: "approved" | "rejected",
  actor: Actor,
  reason?: RejectionReason,
): Promise<GroupChangeRequest> {
```

Immediately inside the function, before `db.transaction`, add the reason validation — it needs no database access, so it fails fast:

```ts
  if (decision === "rejected") {
    if (!reason) {
      throw new ValidationError("Bitte gib einen Grund für die Ablehnung an.");
    }
    if (reason.category === "other" && !reason.message?.trim()) {
      throw new ValidationError("Bei „Sonstiges" ist eine Nachricht erforderlich.");
    }
  }
```

Inside the transaction, **after** `canDecideJoinRequest` has passed, add the member-status guard. The order matters: authorization must be the first check that can reject the caller, or an actor with no standing over the destination group learns that a particular person has been deactivated instead of simply being refused. Reading the row earlier is fine — it is the throw that must come after.

```ts
    const memberRows = await tx
      .select({ status: members.status })
      .from(members)
      .where(eq(members.id, req.memberId))
      .limit(1);
    const memberStatus = memberRows[0]?.status;
    if (memberStatus !== "pending" && memberStatus !== "active") {
      throw new ConflictError("Dieses Mitglied ist nicht mehr aktiv.");
    }
```

Extend the `UPDATE` that writes the decision so it also writes the reason:

```ts
      .set({
        status: decision,
        decidedAt: now,
        decidedBy: actor.userId,
        reasonCategory: decision === "rejected" ? (reason?.category ?? null) : null,
        reasonMessage: decision === "rejected" ? (reason?.message?.trim() || null) : null,
      })
```

Add `ValidationError` to the existing import from `@bdas/errors`.

- [ ] **Step 7: Export the new types**

In `modules/members/src/index.ts`, add `RejectionCategory` and `RejectionReason` to the existing `export type { ... }` block that already carries `GroupChangeRequest`, and add the value export:

```ts
export { REJECTION_CATEGORY_LABELS } from "./types";
```

- [ ] **Step 8: Register `0009` in the test harness**

`0009_reason_required.sql` was written in Task 1 but deliberately left out of `MEMBERS_TEST_MIGRATIONS`, because until this task nothing set a reason and the constraint would have turned the suite red. This task supplies the reason, so the constraint can now be satisfied. Append to the list in `modules/members/src/test-db.ts`, after the `0008` entry, and remove the comment noting the deferral:

```ts
  ["..", "migrations", "0009_reason_required.sql"],
```

From here the harness matches the production end state, so a rejection written without a reason now fails in tests exactly as it would in production.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm vitest run modules/members/src/group-change.test.ts`
Expected: PASS, including the pre-existing blocks.

- [ ] **Step 9: Commit**

```bash
git add modules/members/src/schema.ts modules/members/src/types.ts \
        modules/members/src/services/group-change.ts modules/members/src/index.ts \
        modules/members/src/group-change.test.ts
git commit -m "feat(members): record a reason on rejection

A rejection now carries a required category and an optional message, both
of which the applicant is shown. Deciding a request whose member is no
longer pending or active is refused, so no board can hand a group to a
deactivated person."
```

---

## Task 3: An applicant files a request instead of writing their group

**Files:**
- Modify: `modules/members/src/services/group-change.ts:158-168` (delete the pending straight-through branch)
- Test: `modules/members/src/group-change.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `decideGroupChange` from Task 2.
- Produces: `changePrimaryGroup` returns `{ kind: "requested" }` for a `pending` member choosing a group; `{ kind: "applied" }` remains only for leaving (`toGroupId === null`) and for re-picking the current group, which withdraws an open request.

- [ ] **Step 1: Write the failing tests**

Append to `modules/members/src/group-change.test.ts`:

```ts
describeIfDb("applications from the pool", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
    await createUser(t, "usr_neu", "neu@example.de");
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_neu', 'usr_neu', 'Nina', 'Neu', NULL, 'pending')
    `;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("files a request rather than writing the group", async () => {
    const res = await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    expect(res.kind).toBe("requested");
    const member = await getMember(t.db, "mem_neu");
    expect(member?.primaryGroupId).toBeNull();
  });

  it("emits members.group_change.requested", async () => {
    const seen: MembersEvent[] = [];
    getEventBus().subscribe<MembersEvent>("members.group_change.requested", async (e) => {
      seen.push(e);
    });
    await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    expect(seen).toHaveLength(1);
  });

  it("allows only one open application at a time", async () => {
    await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    await expect(changePrimaryGroup(t.db, "mem_neu", "grp_b", self("usr_neu"))).rejects.toThrow();
  });

  it("lets the applicant withdraw and apply elsewhere", async () => {
    await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    await withdrawGroupChange(t.db, "mem_neu", self("usr_neu"));
    const res = await changePrimaryGroup(t.db, "mem_neu", "grp_b", self("usr_neu"));
    expect(res.kind).toBe("requested");
  });

  it("sets the group and stamps joined_at on approval", async () => {
    const res = await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    if (res.kind !== "requested") throw new Error("expected a request");
    await decideGroupChange(t.db, res.request.id, "approved", FEDERAL);
    const member = await getMember(t.db, "mem_neu");
    expect(member?.primaryGroupId).toBe("grp_a");
    expect(member?.joinedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run modules/members/src/group-change.test.ts -t "applications from the pool"`
Expected: FAIL on the first test — `kind` is `"applied"`, because the pending branch still writes the column straight through.

- [ ] **Step 3: Delete the straight-through branch**

In `modules/members/src/services/group-change.ts`, remove this block entirely (it sits after the "never mind" branch and before the exit branch):

```ts
    // Nothing has been approved for a pending member, so there is nothing to
    // re-approve: their join request simply moves to the other group's queue.
    if (status === "pending") {
      const [updated] = await tx
        .update(members)
        .set({ primaryGroupId: toGroupId, updatedAt: new Date() })
        .where(eq(members.id, memberId))
        .returning();
      if (!updated) throw new Error("changePrimaryGroup: update returned no row");
      return { kind: "applied", member: row2member(updated) };
    }
```

Update the function's doc comment: a pending member now files a request like anyone else, and only an exit applies immediately.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run modules/members`
Expected: PASS. Any pre-existing test asserting the old straight-through behaviour for pending members must be updated to expect `"requested"` — that is the intended change, not a regression.

- [ ] **Step 5: Commit**

```bash
git add modules/members/src/services/group-change.ts modules/members/src/group-change.test.ts
git commit -m "feat(members): an applicant files a request instead of writing their group

primary_group_id is now set only by an approved request, restoring the
invariant that it means a board agreed."
```

---

## Task 4: The groupless pool query

**Files:**
- Create: `modules/members/src/services/pool.ts`
- Modify: `modules/members/src/index.ts`
- Test: `modules/members/src/pool.test.ts`

**Interfaces:**
- Consumes: `Actor` from `./services/status`, `isFederalBoard` from `../roles`.
- Produces: `listGrouplessMembers(db: Db, actor: Actor): Promise<GrouplessMember[]>` where
  `type GrouplessMember = { readonly member: Member; readonly waitingSince: Date }`.
  Returns `[]` for any non-federal actor rather than throwing.

- [ ] **Step 1: Write the failing test**

Create `modules/members/src/pool.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { listGrouplessMembers } from "./services/pool";
import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";
import type { Grant } from "./index";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

const FEDERAL = {
  userId: "usr_federal",
  grants: [{ role: "federal_board", groupId: null }] as ReadonlyArray<Grant>,
};
const LOCAL = {
  userId: "usr_local",
  grants: [{ role: "local_board", groupId: "grp_a" }] as ReadonlyArray<Grant>,
};

describeIfDb("groupless pool", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupMembersDb();
    await createGroup(t, "grp_a", "aachen");
    for (const [id, email] of [
      ["usr_1", "1@example.de"],
      ["usr_2", "2@example.de"],
      ["usr_3", "3@example.de"],
      ["usr_4", "4@example.de"],
    ]) {
      await createUser(t, id!, email!);
    }
    // applicant, never accepted
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_1', 'usr_1', 'Ann', 'Applicant', NULL, 'pending')
    `;
    // member between groups
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_2', 'usr_2', 'Ben', 'Between', NULL, 'active', now())
    `;
    // ordinary member with a group
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_3', 'usr_3', 'Cara', 'Current', 'grp_a', 'active', now())
    `;
    // deactivated, groupless
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_4', 'usr_4', 'Dan', 'Deactivated', NULL, 'inactive', now())
    `;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("returns groupless applicants and members between groups", async () => {
    const pool = await listGrouplessMembers(t.db, FEDERAL);
    expect(pool.map((p) => p.member.id).sort()).toEqual(["mem_1", "mem_2"]);
  });

  it("excludes members who have a group", async () => {
    const pool = await listGrouplessMembers(t.db, FEDERAL);
    expect(pool.map((p) => p.member.id)).not.toContain("mem_3");
  });

  it("excludes deactivated people — they are not looking", async () => {
    const pool = await listGrouplessMembers(t.db, FEDERAL);
    expect(pool.map((p) => p.member.id)).not.toContain("mem_4");
  });

  it("is empty for a local board", async () => {
    expect(await listGrouplessMembers(t.db, LOCAL)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run modules/members/src/pool.test.ts`
Expected: FAIL — cannot resolve `./services/pool`.

- [ ] **Step 3: Write the service**

Create `modules/members/src/services/pool.ts`:

```ts
/**
 * The groupless pool (ADR 0031): everyone in good standing who currently
 * belongs to no group — applicants who were never accepted anywhere, and
 * members between groups. `inactive` and `alumnus` are excluded; they are not
 * looking for a group.
 *
 * Federal-board only. A local board gets an empty list rather than an error:
 * the pool is federation-wide oversight, and a group's own queue is the surface
 * a local board acts on.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { isFederalBoard } from "../roles";
import { members } from "../schema";
import type { Member } from "../types";

import { row2member } from "./get";
import type { Actor, Db } from "./status";

export type GrouplessMember = {
  readonly member: Member;
  /** When they entered the pool. Signup for an applicant; today's proxy is the row's last change. */
  readonly waitingSince: Date;
};

export async function listGrouplessMembers(db: Db, actor: Actor): Promise<GrouplessMember[]> {
  if (!isFederalBoard(actor.grants)) return [];

  const rows = await db
    .select()
    .from(members)
    .where(
      and(isNull(members.primaryGroupId), inArray(members.status, ["pending", "active"])),
    )
    .orderBy(asc(members.createdAt));

  return rows.map((r) => ({
    member: row2member(r),
    waitingSince: r.createdAt,
  }));
}
```

Note: `eq` is imported but unused here — drop it from the import list if the linter objects.

- [ ] **Step 4: Export from the module surface**

In `modules/members/src/index.ts`, add:

```ts
export { listGrouplessMembers, type GrouplessMember } from "./services/pool";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run modules/members/src/pool.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add modules/members/src/services/pool.ts modules/members/src/pool.test.ts \
        modules/members/src/index.ts
git commit -m "feat(members): add the groupless pool query

Federal-board only. Holds applicants never accepted anywhere and members
between groups; deactivated people are excluded."
```

---

## Task 5: Archiving a group closes its open applications

**Files:**
- Create: `modules/members/src/subscribers.ts`
- Create: `apps/web/lib/members-bootstrap.ts`
- Modify: `modules/members/src/index.ts`
- Modify: `apps/web/instrumentation.ts` (call the bootstrap)
- Test: `modules/members/src/subscribers.test.ts`

**Interfaces:**
- Consumes: `GroupArchived` from `@bdas/groups`, the event bus from `@bdas/events`.
- Produces: `registerMembersSubscribers(db: Db): void` and `unregisterMembersSubscribers(): void` (test helper, not exported from `index.ts`). Closes matching requests as `withdrawn`, leaving `reason_category` null.

- [ ] **Step 1: Confirm the event's exported name and shape**

Run: `grep -n "GroupArchived" -A 6 modules/groups/src/events.ts`

Use whatever field carries the group id (`groupId`) in the handler below. If the exported type name differs, use the actual one — do not invent it.

- [ ] **Step 2: Write the failing test**

Create `modules/members/src/subscribers.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import { registerMembersSubscribers, unregisterMembersSubscribers } from "./subscribers";
import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

describeIfDb("members subscribers — group archived", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    unregisterMembersSubscribers();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
    await createUser(t, "usr_1", "1@example.de");
    await createUser(t, "usr_2", "2@example.de");
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_1', 'usr_1', 'Ann', 'Applicant', NULL, 'pending')
    `;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_2', 'usr_2', 'Ben', 'Bewerber', NULL, 'pending')
    `;
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
      VALUES ('mgc_1', 'mem_1', NULL, 'grp_a')
    `;
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
      VALUES ('mgc_2', 'mem_2', NULL, 'grp_b')
    `;
    registerMembersSubscribers(t.db);
  });

  afterEach(async () => {
    unregisterMembersSubscribers();
    await t.cleanup();
  });

  it("withdraws open applications to the archived group", async () => {
    await getEventBus().publish({
      type: "groups.group.archived",
      groupId: "grp_a",
      at: new Date(),
    });
    const [row] = await t.client`
      SELECT status, reason_category FROM member_group_change_requests WHERE id = 'mgc_1'
    `;
    expect(row!["status"]).toBe("withdrawn");
    expect(row!["reason_category"]).toBeNull();
  });

  it("does not say the applicant was rejected", async () => {
    await getEventBus().publish({
      type: "groups.group.archived",
      groupId: "grp_a",
      at: new Date(),
    });
    const rows = await t.client`
      SELECT id FROM member_group_change_requests WHERE status = 'rejected'
    `;
    expect(rows).toHaveLength(0);
  });

  it("leaves applications to other groups alone", async () => {
    await getEventBus().publish({
      type: "groups.group.archived",
      groupId: "grp_a",
      at: new Date(),
    });
    const [row] = await t.client`
      SELECT status FROM member_group_change_requests WHERE id = 'mgc_2'
    `;
    expect(row!["status"]).toBe("pending");
  });

  it("frees the applicant to apply elsewhere", async () => {
    await getEventBus().publish({
      type: "groups.group.archived",
      groupId: "grp_a",
      at: new Date(),
    });
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
      VALUES ('mgc_3', 'mem_1', NULL, 'grp_b')
    `;
    const rows = await t.client`
      SELECT id FROM member_group_change_requests WHERE member_id = 'mem_1' AND status = 'pending'
    `;
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run modules/members/src/subscribers.test.ts`
Expected: FAIL — cannot resolve `./subscribers`.

- [ ] **Step 4: Write the subscriber**

Create `modules/members/src/subscribers.ts`:

```ts
/**
 * Bridge the groups module's archive event to the application queue (ADR 0031).
 *
 * Archiving does not revoke board grants, so `groupHasActiveLocalBoard` stays
 * true and ADR 0021's federal fallback stays shut — while `canSeeGroupScope`
 * already locks a local board out of an archived group. An open application to
 * an archived group would therefore be decidable by nobody.
 *
 * They are closed as `withdrawn`, never `rejected`: no one judged the applicant,
 * so nothing may tell them they were turned down. `reason_category` stays null.
 * Handlers never throw into the producer.
 */
import { and, eq } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { getEventBus, type Subscription } from "@bdas/events";
import type { GroupArchived } from "@bdas/groups";

import type { GroupChangeWithdrawn } from "./events";
import { memberGroupChangeRequests } from "./schema";

let subs: Subscription[] = [];

export function registerMembersSubscribers(db: Db): void {
  if (subs.length > 0) return;
  subs = [
    getEventBus().subscribe<GroupArchived>("groups.group.archived", async (e) => {
      try {
        const closed = await db
          .update(memberGroupChangeRequests)
          .set({ status: "withdrawn", decidedAt: new Date(), decidedBy: "system" })
          .where(
            and(
              eq(memberGroupChangeRequests.toGroupId, e.groupId),
              eq(memberGroupChangeRequests.status, "pending"),
            ),
          )
          .returning();

        for (const row of closed) {
          const event: GroupChangeWithdrawn = {
            type: "members.group_change.withdrawn",
            requestId: row.id,
            memberId: row.memberId,
            actorUserId: "system",
            at: new Date(),
          };
          await getEventBus().publish(event);
        }
      } catch (err) {
        console.error(`[members] closing applications for archived group ${e.groupId} failed:`, err);
      }
    }),
  ];
}

/** Test helper: drop all subscriptions. Not part of the public surface. */
export function unregisterMembersSubscribers(): void {
  for (const s of subs) s.unsubscribe();
  subs = [];
}
```

- [ ] **Step 5: Export and bootstrap**

In `modules/members/src/index.ts`:

```ts
export { registerMembersSubscribers } from "./subscribers";
```

Create `apps/web/lib/members-bootstrap.ts`:

```ts
import { getDb } from "@bdas/db";
import { registerMembersSubscribers } from "@bdas/members";

let booted = false;

/**
 * Idempotent members bootstrap. Subscribes to groups.group.archived so an
 * archived group's open applications are closed rather than stranded (ADR 0031).
 * No feature flag: the members module is live, and an unsubscribed instance
 * would silently strand applicants.
 */
export function bootMembers(): void {
  if (booted) return;
  registerMembersSubscribers(getDb());
  booted = true;
}
```

In `apps/web/instrumentation.ts`, call `bootMembers()` alongside the existing boot calls. Follow the file's existing error handling — read it before editing. The event bus is `globalThis`-backed, so a subscription registered in instrumentation is visible to route handlers.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run modules/members`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/members/src/subscribers.ts modules/members/src/subscribers.test.ts \
        modules/members/src/index.ts apps/web/lib/members-bootstrap.ts apps/web/instrumentation.ts
git commit -m "feat(members): close applications to an archived group

Withdrawn, not rejected — nobody judged the applicant, so nothing tells
them they were turned down. Without this the request is decidable by
nobody: archiving keeps board grants, which holds the federal fallback
shut, while a local board loses scope over an archived group."
```

---

## Task 6: Phase 1 gate — full suite and typecheck

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm vitest run`
Expected: PASS.

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm -r typecheck && pnpm -r lint`
Expected: clean. The `members` public surface changed, so any app-layer caller of `decideGroupChange` still compiles — the `reason` parameter is optional.

- [ ] **Step 3: Confirm the old path still works**

The board's approve/reject buttons still call `transitionStatus`; nothing user-facing has changed yet. Start the app and confirm the members table still renders:

Run: `pnpm dev` and open `/gruppe/<slug>/members`
Expected: unchanged behaviour.

- [ ] **Step 4: Apply `0008` to production — and only `0008`**

**This step changes real people's records and is not reversible. It needs explicit human go-ahead, and no subagent may perform it.**

Apply `0008_application_reasons.sql` by hand, then record it:

```sql
INSERT INTO _bdas_migrations (name) VALUES ('members/0008_application_reasons.sql');
```

Read an existing row of `_bdas_migrations` first and match its format.

`0008` is safe against the code that is running right now: it adds nullable columns, backfills, and its two constraints are both satisfied by a NULL reason category.

**Do not apply `0009_reason_required.sql` here.** It enforces that every rejection carries a reason, which the currently-deployed code does not do — applying it now breaks every rejection in the live app. It goes on after Phase 2's deploy, in the checklist at the end of this plan.

Before applying, confirm what the backfill will touch:

```sql
SELECT count(*) FROM members WHERE status = 'pending' AND primary_group_id IS NOT NULL;
SELECT count(*) FROM members WHERE status = 'inactive' AND joined_at IS NULL;
```

The first count is live applications that will keep their queue position. The second is people currently stranded who will be returned to the pool. Expect both numbers to be small; if either is surprising, stop and investigate before running the migration.

---

# Phase 2 — Board surfaces

## Task 7: The group application queue

**Files:**
- Create: `apps/web/app/(board)/gruppe/[slug]/bewerbungen/page.tsx`
- Create: `apps/web/app/(board)/_components/ApplicationCard.tsx`
- Create: `apps/web/app/(board)/_components/application-actions.ts`
- Modify: `apps/web/app/(board)/nav.ts:17-28` (add the nav item)
- Test: `apps/web/app/(board)/nav.test.ts`

**Interfaces:**
- Consumes: `listIncomingGroupChanges(db, toGroupId, actor)` → `IncomingGroupChange[]`; `getGroupChangeHistory(db, memberId, actor)`; `getProfile(db, userId)` from `@bdas/profile`; `decideGroupChange(db, requestId, decision, actor, reason?)`.
- Produces: server actions `acceptApplicationAction(requestId: string, slug: string)` and `rejectApplicationAction(requestId: string, slug: string, reason: RejectionReason)`, both returning `{ ok: boolean; error?: string }`.

- [ ] **Step 1: Add the nav item and its test**

In `apps/web/app/(board)/nav.ts`, inside `groupNav`, after the `members` entry:

```ts
    { href: `${base}/bewerbungen`, label: "Bewerbungen" },
```

Add to `apps/web/app/(board)/nav.test.ts`:

```ts
it("includes the applications queue in the group scope", () => {
  const items = groupNav("berlin");
  expect(items.map((i) => i.href)).toContain("/gruppe/berlin/bewerbungen");
});

it("keeps Bewerbungen active on nested routes", () => {
  expect(isNavItemActive("/gruppe/berlin/bewerbungen", "/gruppe/berlin/bewerbungen")).toBe(true);
  expect(isNavItemActive("/gruppe/berlin/members", "/gruppe/berlin/bewerbungen")).toBe(false);
});
```

- [ ] **Step 2: Run the nav test to verify it passes**

Run: `pnpm vitest run apps/web/app/\(board\)/nav.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the server actions**

Create `apps/web/app/(board)/_components/application-actions.ts`:

```ts
"use server";

import { getDb } from "@bdas/db";
import { decideGroupChange, type RejectionReason } from "@bdas/members";

import { actor } from "./member-actions";
import { safeRevalidate } from "./group-change-actions";

export async function acceptApplicationAction(
  requestId: string,
  slug: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await decideGroupChange(getDb(), requestId, "approved", await actor());
    safeRevalidate(`/gruppe/${slug}/bewerbungen`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

export async function rejectApplicationAction(
  requestId: string,
  slug: string,
  reason: RejectionReason,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await decideGroupChange(getDb(), requestId, "rejected", await actor(), reason);
    safeRevalidate(`/gruppe/${slug}/bewerbungen`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
```

Read `member-actions.ts` and `group-change-actions.ts` first: reuse their existing `actor()` and `safeRevalidate` helpers rather than duplicating them. If they are not exported, export them — do not write a second copy.

- [ ] **Step 4: Write the page**

Create `apps/web/app/(board)/gruppe/[slug]/bewerbungen/page.tsx`:

```tsx
import { getDb } from "@bdas/db";
import { getGroupChangeHistory, listIncomingGroupChanges } from "@bdas/members";
import { getProfile } from "@bdas/profile";
import { isFlagOn } from "@bdas/feature-flags";

import { requireGroupScope } from "../../../../_dashboard/session";
import { signedProfilePhotoUrl } from "../../../../_profile/photo-url";
import { ApplicationCard } from "../../../_components/ApplicationCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bewerbungen" };

export default async function BewerbungenPage({ params }: { params: { slug: string } }) {
  const { me, groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const incoming = await listIncomingGroupChanges(db, groupId, me);
  const profileFlagOn = isFlagOn("profile");

  const cards = await Promise.all(
    incoming.map(async (req) => {
      const profile = profileFlagOn ? await getProfile(db, req.member.userId) : null;
      const history = await getGroupChangeHistory(db, req.member.id, me);
      const priorRejections = history.filter(
        (h) => h.status === "rejected" && h.toGroupId === groupId,
      );
      return {
        req,
        profile,
        photoUrl: await signedProfilePhotoUrl(profile?.photoStorageKey),
        priorRejections,
      };
    }),
  );

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-bdas-ink">Bewerbungen</h1>
        <p className="text-bdas-ink-body">
          {cards.length === 0
            ? "Zurzeit liegen keine Bewerbungen vor."
            : `${cards.length} offene ${cards.length === 1 ? "Bewerbung" : "Bewerbungen"}.`}
        </p>
      </header>

      {cards.map(({ req, profile, photoUrl, priorRejections }) => (
        <ApplicationCard
          key={req.id}
          requestId={req.id}
          slug={params.slug}
          canDecide={req.canDecide}
          name={`${req.member.firstName} ${req.member.lastName}`}
          isExistingMember={req.member.status === "active"}
          requestedAt={req.requestedAt}
          photoUrl={photoUrl}
          profile={
            profile
              ? {
                  uni: profile.uni,
                  studiengang: profile.studiengang,
                  abschlussart: profile.abschlussart,
                  geburtsdatum: profile.geburtsdatum,
                  gefundenDurch: profile.gefundenDurch,
                  empfehlerName: profile.empfehlerName,
                }
              : null
          }
          priorRejections={priorRejections.map((r) => ({
            decidedAt: r.decidedAt,
            category: r.reasonCategory,
          }))}
        />
      ))}
    </main>
  );
}
```

Check the relative depth of the `../../../..` imports against a sibling page such as `gruppe/[slug]/members/page.tsx` and match it — the depth depends on the route folder nesting.

The page imports `ApplicationCard`, which Task 8 creates together with the dialog it hosts — they are one deliverable and splitting them would ship a stub. The page therefore does not typecheck until Task 8 is done; run Task 8 immediately after this one and verify both together in Task 8 step 7.

- [ ] **Step 5: Commit the nav and actions**

```bash
git add "apps/web/app/(board)/nav.ts" "apps/web/app/(board)/nav.test.ts" \
        "apps/web/app/(board)/_components/application-actions.ts"
git commit -m "feat(web): add the Bewerbungen nav item and decision actions"
```

---

## Task 8: The application card and the rejection dialog

**Files:**
- Create: `apps/web/app/(board)/_components/ApplicationCard.tsx`
- Create: `apps/web/app/(board)/_components/RejectDialog.tsx`
- Create: `apps/web/app/(board)/_components/rejection-categories.ts`
- Test: `apps/web/app/(board)/_components/rejection-categories.test.ts`

**Interfaces:**
- Consumes: `acceptApplicationAction`, `rejectApplicationAction` from Task 7; `RejectionCategory` from `@bdas/members`.
- Produces: `REJECTION_CATEGORIES: ReadonlyArray<{ key: RejectionCategory; label: string }>` and `categoryLabel(key: string | null): string`.

- [ ] **Step 1: Write the failing label test**

Create `apps/web/app/(board)/_components/rejection-categories.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { categoryLabel, REJECTION_CATEGORIES } from "./rejection-categories";

describe("rejection categories", () => {
  it("offers exactly the three agreed categories", () => {
    expect(REJECTION_CATEGORIES.map((c) => c.key)).toEqual([
      "no_contact",
      "not_a_student",
      "other",
    ]);
  });

  it("renders German labels", () => {
    expect(categoryLabel("no_contact")).toBe("Kein Kontakt zustande gekommen");
    expect(categoryLabel("not_a_student")).toBe("Kein Student mehr");
    expect(categoryLabel("other")).toBe("Sonstiges");
  });

  it("falls back for an unknown or missing key", () => {
    expect(categoryLabel(null)).toBe("Kein Grund angegeben");
    expect(categoryLabel("was_auch_immer")).toBe("Kein Grund angegeben");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run "apps/web/app/(board)/_components/rejection-categories.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the categories module**

Create `apps/web/app/(board)/_components/rejection-categories.ts`:

```ts
import { REJECTION_CATEGORY_LABELS, type RejectionCategory } from "@bdas/members";

/**
 * Dropdown order for the board. The labels themselves come from the members
 * module, which owns the column — duplicating them here would let the email and
 * the dropdown drift apart.
 */
export const REJECTION_CATEGORIES: ReadonlyArray<{
  readonly key: RejectionCategory;
  readonly label: string;
}> = (["no_contact", "not_a_student", "other"] as const).map((key) => ({
  key,
  label: REJECTION_CATEGORY_LABELS[key],
}));

export function categoryLabel(key: string | null): string {
  if (key !== null && key in REJECTION_CATEGORY_LABELS) {
    return REJECTION_CATEGORY_LABELS[key as RejectionCategory];
  }
  return "Kein Grund angegeben";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run "apps/web/app/(board)/_components/rejection-categories.test.ts"`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the rejection dialog**

Create `apps/web/app/(board)/_components/RejectDialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { Button, Card } from "@bdas/design-system";
import type { RejectionCategory } from "@bdas/members";

import { rejectApplicationAction } from "./application-actions";
import { REJECTION_CATEGORIES } from "./rejection-categories";

export function RejectDialog({
  requestId,
  slug,
  name,
  onClose,
}: {
  requestId: string;
  slug: string;
  name: string;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<RejectionCategory>("no_contact");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const messageRequired = category === "other";
  const canSubmit = !messageRequired || message.trim().length > 0;

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await rejectApplicationAction(requestId, slug, {
        category,
        message: message.trim() || null,
      });
      if (res.ok) onClose();
      else setError(res.error ?? "Fehler");
    });
  };

  return (
    <Card flat className="mt-4 p-4">
      <h3 className="mb-3 text-lg font-semibold text-bdas-ink">Bewerbung von {name} ablehnen</h3>

      <label className="mb-1 block text-sm font-medium text-bdas-ink-body" htmlFor="reject-category">
        Grund
      </label>
      <select
        id="reject-category"
        className="mb-4 w-full rounded-bdas-sm border border-bdas-soft p-2"
        value={category}
        onChange={(e) => setCategory(e.target.value as RejectionCategory)}
      >
        {REJECTION_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-sm font-medium text-bdas-ink-body" htmlFor="reject-message">
        Nachricht an die Bewerberin / den Bewerber{messageRequired ? "" : " (optional)"}
      </label>
      <textarea
        id="reject-message"
        className="mb-2 w-full rounded-bdas-sm border border-bdas-soft p-2"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <p className="mb-4 text-sm text-bdas-ink-muted">
        Grund und Nachricht sind für die Bewerberin sichtbar.
      </p>

      {error ? <p className="mb-3 text-sm text-bdas-red">{error}</p> : null}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || !canSubmit}>
          {pending ? "Wird gesendet …" : "Ablehnen"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Abbrechen
        </Button>
      </div>
    </Card>
  );
}
```

Confirm the exact prop names of `Button` and `Card` against `core/design-system` before writing — this uses `variant="secondary"` and `flat`, which the account page already uses.

- [ ] **Step 6: Write the application card**

Create `apps/web/app/(board)/_components/ApplicationCard.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { Button, Card } from "@bdas/design-system";

import { acceptApplicationAction } from "./application-actions";
import { categoryLabel } from "./rejection-categories";
import { RejectDialog } from "./RejectDialog";

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("de-DE") : "—");

export function ApplicationCard({
  requestId,
  slug,
  canDecide,
  name,
  isExistingMember,
  requestedAt,
  photoUrl,
  profile,
  priorRejections,
}: {
  requestId: string;
  slug: string;
  canDecide: boolean;
  name: string;
  isExistingMember: boolean;
  requestedAt: Date;
  photoUrl: string | null;
  profile: {
    uni: string;
    studiengang: string;
    abschlussart: string;
    geburtsdatum: string;
    gefundenDurch: string;
    empfehlerName: string | null;
  } | null;
  priorRejections: ReadonlyArray<{ decidedAt: Date | null; category: string | null }>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const accept = () => {
    setError(null);
    start(async () => {
      const res = await acceptApplicationAction(requestId, slug);
      if (!res.ok) setError(res.error ?? "Fehler");
    });
  };

  return (
    <Card className="p-5">
      <div className="flex gap-4">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-16 w-16 rounded-bdas-md object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-bdas-md bg-bdas-surface-hover" />
        )}

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-bdas-ink">
            {name}
            {isExistingMember ? (
              <span className="ml-2 rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-ink-body">
                Mitglied ohne Gruppe
              </span>
            ) : null}
          </h2>

          {profile ? (
            <p className="mt-1 text-sm text-bdas-ink-body">
              {profile.uni} · {profile.studiengang}, {profile.abschlussart}
              <br />
              geb. {new Date(profile.geburtsdatum).toLocaleDateString("de-DE")}
              <br />
              Gefunden durch: {profile.gefundenDurch}
              {profile.empfehlerName ? ` — empfohlen von ${profile.empfehlerName}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-sm text-bdas-ink-muted">Kein erweitertes Profil hinterlegt.</p>
          )}

          <p className="mt-1 text-sm text-bdas-ink-muted">Beworben am {fmt(requestedAt)}</p>

          {priorRejections.length > 0 ? (
            <p className="mt-2 rounded-bdas-sm bg-bdas-surface-hover px-2 py-1 text-sm text-bdas-red">
              {priorRejections.length + 1}. Bewerbung — zuletzt abgelehnt am{" "}
              {fmt(priorRejections[0]!.decidedAt)} ({categoryLabel(priorRejections[0]!.category)})
            </p>
          ) : null}

          {error ? <p className="mt-2 text-sm text-bdas-red">{error}</p> : null}

          {canDecide ? (
            <div className="mt-3 flex gap-2">
              <Button onClick={accept} disabled={pending || rejecting}>
                {pending ? "Wird gespeichert …" : "Aufnehmen"}
              </Button>
              <Button variant="secondary" onClick={() => setRejecting(true)} disabled={pending}>
                Ablehnen …
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-bdas-ink-muted">
              Über diese Bewerbung entscheidet der lokale Vorstand.
            </p>
          )}
        </div>
      </div>

      {rejecting ? (
        <RejectDialog
          requestId={requestId}
          slug={slug}
          name={name}
          onClose={() => setRejecting(false)}
        />
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 7: Verify the page renders end to end**

Run: `pnpm dev`, sign in as a local board member, seed one applicant, and open `/gruppe/<slug>/bewerbungen`.

Expected: the card shows the full profile; `Aufnehmen` assigns the group and the card disappears; `Ablehnen …` opens the dialog, `Sonstiges` disables the submit button until a message is typed, and rejecting removes the card while leaving the applicant groupless.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/(board)/_components/ApplicationCard.tsx" \
        "apps/web/app/(board)/_components/RejectDialog.tsx" \
        "apps/web/app/(board)/_components/rejection-categories.ts" \
        "apps/web/app/(board)/_components/rejection-categories.test.ts" \
        "apps/web/app/(board)/gruppe/[slug]/bewerbungen/page.tsx"
git commit -m "feat(web): review applications with the applicant's profile in view

Boards decide from the card without navigating. Rejection requires a
category and shows the board that both it and the message reach the
applicant."
```

---

## Task 9: The federal pool page

**Files:**
- Create: `apps/web/app/(board)/federal/pool/page.tsx`
- Modify: `apps/web/app/(board)/nav.ts:8-15` (add to `FEDERAL_NAV`)
- Modify: `apps/web/app/(board)/nav.test.ts`

**Interfaces:**
- Consumes: `listGrouplessMembers` (Task 4), `listOpenGroupChanges(db, actor)` → `OpenGroupChange[]`, `listGroups` from `@bdas/groups`, `getProfile` from `@bdas/profile`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add the nav entry and test**

In `apps/web/app/(board)/nav.ts`, add to `FEDERAL_NAV` after the members entry:

```ts
  { href: "/federal/pool", label: "Ohne Gruppe" },
```

Add to `apps/web/app/(board)/nav.test.ts`:

```ts
it("gives the federal scope the groupless pool", () => {
  expect(FEDERAL_NAV.map((i) => i.href)).toContain("/federal/pool");
});
```

- [ ] **Step 2: Write the page**

Create `apps/web/app/(board)/federal/pool/page.tsx`:

```tsx
import Link from "next/link";

import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";
import { listGroups } from "@bdas/groups";
import { listGrouplessMembers, listOpenGroupChanges } from "@bdas/members";
import { getProfile } from "@bdas/profile";

import { requireFederalScope } from "../../../_dashboard/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ohne Gruppe" };

const days = (from: Date) =>
  Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000));

export default async function PoolPage() {
  const me = await requireFederalScope();
  const db = getDb();
  const profileFlagOn = isFlagOn("profile");

  const pool = await listGrouplessMembers(db, me);
  const open = await listOpenGroupChanges(db, me);
  const groups = await listGroups(db, {});
  const groupName = (id: string | null) =>
    id === null ? "keine Gruppe" : (groups.find((g) => g.id === id)?.name ?? "—");

  const rows = await Promise.all(
    pool.map(async (p) => ({
      ...p,
      uni: profileFlagOn ? ((await getProfile(db, p.member.userId))?.uni ?? "—") : "—",
    })),
  );

  return (
    <main className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-bdas-ink">Ohne Gruppe</h1>
          <p className="text-bdas-ink-body">
            {rows.length} {rows.length === 1 ? "Person" : "Personen"} ohne Gruppenzugehörigkeit.
            Name, Universität und Wartezeit — mehr nicht.
          </p>
        </div>

        <Card flat className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bdas-soft text-left text-bdas-ink-muted">
                <th className="p-3 font-semibold">Name</th>
                <th className="p-3 font-semibold">Universität</th>
                <th className="p-3 font-semibold">Wartet seit</th>
                <th className="p-3 font-semibold">Art</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="p-3 text-bdas-ink-muted" colSpan={4}>
                    Niemand wartet zurzeit auf eine Gruppe.
                  </td>
                </tr>
              ) : (
                rows.map(({ member, waitingSince, uni }) => (
                  <tr key={member.id} className="border-b border-bdas-soft">
                    <td className="p-3">
                      {member.firstName[0]}. {member.lastName}
                    </td>
                    <td className="p-3">{uni}</td>
                    <td className="p-3">{days(waitingSince)} Tage</td>
                    <td className="p-3 text-bdas-ink-muted">
                      {member.status === "active" ? "Mitglied ohne Gruppe" : "Bewerber:in"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-semibold text-bdas-ink">
            Offene Bewerbungen (alle Gruppen)
          </h2>
          <p className="text-bdas-ink-body">
            Jede unentschiedene Bewerbung im Verband. Der einzige Weg zur Warteschlange einer
            Gruppe, die nicht mehr aktiv ist.
          </p>
        </div>

        <Card flat className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bdas-soft text-left text-bdas-ink-muted">
                <th className="p-3 font-semibold">Zielgruppe</th>
                <th className="p-3 font-semibold">Beworben am</th>
                <th className="p-3 font-semibold">Entscheidbar</th>
                <th className="p-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {open.length === 0 ? (
                <tr>
                  <td className="p-3 text-bdas-ink-muted" colSpan={4}>
                    Keine offenen Bewerbungen.
                  </td>
                </tr>
              ) : (
                open.map((r) => {
                  const slug = groups.find((g) => g.id === r.toGroupId)?.slug;
                  return (
                    <tr key={r.id} className="border-b border-bdas-soft">
                      <td className="p-3">{groupName(r.toGroupId)}</td>
                      <td className="p-3">
                        {new Date(r.requestedAt).toLocaleDateString("de-DE")}
                      </td>
                      <td className="p-3 text-bdas-ink-muted">
                        {r.canDecide ? "durch dich" : "durch den lokalen Vorstand"}
                      </td>
                      <td className="p-3">
                        {slug ? (
                          <Link
                            href={`/gruppe/${slug}/bewerbungen`}
                            className="text-bdas-red hover:underline"
                          >
                            Zur Warteschlange →
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </main>
  );
}
```

Check `apps/web/app/_dashboard/session.ts` for the federal guard's actual name — it may be `requireFederalScope` or `requireBoardAccess` plus an `isFederalBoard` check. Use what exists; do not invent a helper. Likewise confirm `listGroups(db, {})` returns every status, since the second table must resolve names for dormant and archived groups.

- [ ] **Step 3: Verify it renders**

Run: `pnpm dev`, sign in as federal board, open `/federal/pool`.
Expected: groupless people listed with initial-plus-surname, no date of birth or photo anywhere; the second table links into each group's queue.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(board)/federal/pool/page.tsx" \
        "apps/web/app/(board)/nav.ts" "apps/web/app/(board)/nav.test.ts"
git commit -m "feat(web): give the federal board the groupless pool

Minimal fields only. The open-applications table is the sole route to the
queue of a group that has left active status, which the scope switcher
filters out."
```

---

## Task 10: Rewire the notifications

**Files:**
- Modify: `modules/notifications/src/subscribers.ts:243-270`
- Modify: `modules/notifications/src/templates.ts:85-97`
- Modify: `modules/notifications/src/types.ts:18`
- Test: `modules/notifications/src/templates.test.ts`

**Interfaces:**
- Consumes: `GroupChangeRequested`, `GroupChangeDecided`, `GroupChangeWithdrawn` from `@bdas/members`.
- Produces: template key `member_application_group_dissolved`; `member_application_declined` gains `reasonCategoryLabel` and `reasonMessage` template data.

- [ ] **Step 1: Write the failing template test**

Append to `modules/notifications/src/templates.test.ts`:

```ts
it("puts the rejection reason in the decline email", () => {
  const mail = renderTemplate("member_application_declined", {
    firstName: "Anna",
    reasonCategoryLabel: "Kein Kontakt zustande gekommen",
    reasonMessage: "Wir haben dich dreimal nicht erreicht.",
  });
  expect(mail.body).toContain("Kein Kontakt zustande gekommen");
  expect(mail.body).toContain("Wir haben dich dreimal nicht erreicht.");
});

it("omits the message line when the board wrote none", () => {
  const mail = renderTemplate("member_application_declined", {
    firstName: "Anna",
    reasonCategoryLabel: "Kein Student mehr",
  });
  expect(mail.body).toContain("Kein Student mehr");
  expect(mail.body).not.toContain("undefined");
});

it("tells a dissolved group's applicants they were not rejected", () => {
  const mail = renderTemplate("member_application_group_dissolved", {
    firstName: "Anna",
    groupName: "BDAS Aachen",
  });
  expect(mail.body).toContain("aufgelöst");
  expect(mail.body).not.toMatch(/abgelehnt|nicht angenommen/);
});
```

Match the actual renderer name and call signature used by the existing tests in that file — read them first and follow the same shape.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run modules/notifications/src/templates.test.ts`
Expected: FAIL — the template key is unknown and the reason is not rendered.

- [ ] **Step 3: Add the template key**

In `modules/notifications/src/types.ts`, add to the template-key union:

```ts
  | "member_application_group_dissolved"
```

Add the new template data fields to whatever data type that file declares for template payloads: `reasonCategoryLabel?: string`, `reasonMessage?: string`, `groupName?: string`.

- [ ] **Step 4: Update the templates**

In `modules/notifications/src/templates.ts`, replace the `member_application_declined` case:

```ts
    case "member_application_declined":
      return body(
        "BDAS — Entscheidung über deine Bewerbung",
        firstName,
        [
          "dein lokaler Vorstand hat deine Bewerbung geprüft und sie nicht angenommen.",
          data.reasonCategoryLabel ? `Grund: ${data.reasonCategoryLabel}.` : null,
          data.reasonMessage ? `„${data.reasonMessage}"` : null,
          "Du kannst dich jederzeit bei einer anderen BDAS-Gruppe bewerben.",
        ]
          .filter(Boolean)
          .join(" "),
      );
    case "member_application_group_dissolved":
      return body(
        "BDAS — Deine Bewerbung konnte nicht entschieden werden",
        firstName,
        `die Gruppe${data.groupName ? ` ${data.groupName}` : ""} wurde aufgelöst, bevor über deine Bewerbung entschieden werden konnte. Das ist keine Absage — bitte bewirb dich gerne bei einer anderen BDAS-Gruppe.`,
      );
```

- [ ] **Step 5: Move the subscribers**

In `modules/notifications/src/subscribers.ts`:

Delete the board-notification branch from the `profile.completed` subscriber — it routes by the group the wizard collected, which no longer exists. Keep the subscriber if it does anything else; otherwise remove it entirely.

Delete the `members.status.changed` subscriber's `from === "pending"` branch. If that leaves the subscriber empty, remove it.

**Then remove what that branch was the only consumer of.** Task 3 added a `StatusChanged` emission inside `decideGroupChange`'s approval path, with a comment saying it exists "so the acceptance notification still fires". Once the acceptance email moves onto `members.group_change.decided` here, that emission has no subscriber and the comment is false. Delete the emission and the comment together — leaving them is dead code that reads as if it still matters. Keep the status write and the `joined_at` stamp; only the event publication goes.

Add:

```ts
    getEventBus().subscribe<GroupChangeRequested>(
      "members.group_change.requested",
      safe<GroupChangeRequested>(async (e) => {
        if (e.toGroupId === null) return; // an exit needs no board
        const applicant = await getMember(db, e.memberId);
        const recipients = await listBoardRecipientsForGroup(db, e.toGroupId);
        for (const memberId of recipients) {
          await sendTransactional(db, "member_application_received", memberId, {
            applicantName: applicant ? `${applicant.firstName} ${applicant.lastName}` : undefined,
          });
        }
      }),
    ),
    getEventBus().subscribe<GroupChangeDecided>(
      "members.group_change.decided",
      safe<GroupChangeDecided>(async (e) => {
        if (e.fromGroupId !== null) return; // a transfer is not an application
        if (e.decision === "approved") {
          await sendTransactional(db, "member_application_approved", e.memberId, {});
        } else {
          const request = await getGroupChangeRequest(db, e.requestId);
          await sendTransactional(db, "member_application_declined", e.memberId, {
            reasonCategoryLabel: categoryLabel(request?.reasonCategory ?? null),
            reasonMessage: request?.reasonMessage ?? undefined,
          });
        }
      }),
    ),
```

This needs one thing that does not exist yet: `getGroupChangeRequest(db, requestId)` on the members public surface. Add it to `modules/members/src/services/group-change.ts` and export it, returning `GroupChangeRequest | null`:

```ts
/** One request by id. Used by notifications to read the reason a board wrote. */
export async function getGroupChangeRequest(
  db: Db,
  requestId: string,
): Promise<GroupChangeRequest | null> {
  const rows = await db
    .select()
    .from(memberGroupChangeRequests)
    .where(eq(memberGroupChangeRequests.id, requestId))
    .limit(1);
  return rows[0] ? row2request(rows[0]) : null;
}
```

`categoryLabel` here reads `REJECTION_CATEGORY_LABELS` from `@bdas/members` (added in Task 2) — never the app-layer component from Task 8, which would be a cross-boundary import:

```ts
const categoryLabel = (key: string | null): string | undefined =>
  key !== null && key in REJECTION_CATEGORY_LABELS
    ? REJECTION_CATEGORY_LABELS[key as RejectionCategory]
    : undefined;
```

For the dissolved-group mail, subscribe to `members.group_change.withdrawn` and send `member_application_group_dissolved` only when `actorUserId === "system"` — a member withdrawing their own application should get no email.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run modules/notifications modules/members`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/notifications/src modules/members/src
git commit -m "feat(notifications): route application mail off the request, not the wizard

The wizard no longer collects a group, so profile.completed has no group
to route by. Decline mail now carries the category and message; a
dissolved group gets its own template that does not say 'rejected'."
```

---

## Task 11: Delete the replaced board surfaces

**Files:**
- Modify: `apps/web/app/(board)/_components/MembersTable.tsx:12-21`, `:100-125`, `:190-210`
- Delete: `apps/web/app/(board)/_components/member-actions.ts` (approve/reject only — keep `actor()` if Task 7 reuses it, moving it to a shared module)
- Delete: `apps/web/app/admin/pending-members/`

- [ ] **Step 1: Remove the approve/reject UI from the members table**

In `MembersTable.tsx`, delete the `pending` branch that renders the approve and reject buttons, the `Ausstehend` entry from `FILTERS`, and the now-unused imports of `approveMemberAction` / `rejectMemberAction`. Leave `MemberGroupPanel` and the status pill alone — transfers still render there.

- [ ] **Step 2: Relocate the shared actor helper**

If `actor()` lived in `member-actions.ts` and Task 7 imported it, move it to `apps/web/app/(board)/_components/board-actor.ts` and update both importers. Then delete `member-actions.ts`.

- [ ] **Step 3: Delete the federal pending-members page**

```bash
git rm -r apps/web/app/admin/pending-members
```

Grep for links to it before deleting and remove them:

Run: `grep -rn "pending-members" apps/web`

- [ ] **Step 4: Typecheck, lint, test**

Run: `pnpm -r typecheck && pnpm -r lint && pnpm vitest run`
Expected: clean. `listPendingMembers` may now be unused — if nothing imports it, remove it from `modules/members/src/index.ts` and delete `services/list-pending.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(web): remove the status-based join UI

Replaced by the per-group Bewerbungen queue. The federal pending-members
page is superseded: federal reaches a boardless group's queue through the
scope switcher, or the open-applications table on the pool page."
```

---

# Phase 3 — Applicant surface

## Task 12: Status blocks and the apply action on /account

**Files:**
- Modify: `apps/web/app/account/page.tsx:23-110`
- Create: `apps/web/app/account/GrouplessPanel.tsx`
- Create: `apps/web/app/account/apply-actions.ts`
- Test: `apps/web/app/account/apply-actions.test.ts`

**Interfaces:**
- Consumes: `getOpenGroupChange`, `getGroupChangeHistory`, `changePrimaryGroup`, `REJECTION_CATEGORY_LABELS` from `@bdas/members`; `listGroups` from `@bdas/groups`.
- Produces: `applyToGroupAction(groupId: string)` returning `{ ok: boolean; error?: string }`, which refuses any group that is not `active` or `dormant`.

- [ ] **Step 1: Write the failing guard test**

Create `apps/web/app/account/apply-actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isApplicableGroupStatus } from "./apply-actions";

describe("applicable group status", () => {
  it("accepts active and dormant", () => {
    expect(isApplicableGroupStatus("active")).toBe(true);
    expect(isApplicableGroupStatus("dormant")).toBe(true);
  });

  it("refuses new and archived", () => {
    expect(isApplicableGroupStatus("new")).toBe(false);
    expect(isApplicableGroupStatus("archived")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/app/account/apply-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the action**

Create `apps/web/app/account/apply-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { getGroup } from "@bdas/groups";
import { changePrimaryGroup, getCurrentMember, withdrawGroupChange } from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";

/**
 * Applications may target active and dormant groups only. The members module
 * deliberately cannot read the groups table (CLAUDE.md §1 rule 1), so the
 * destination must be authorized here — otherwise a crafted POST files an
 * application against an archived group.
 */
export function isApplicableGroupStatus(status: string): boolean {
  return status === "active" || status === "dormant";
}

export async function applyToGroupAction(
  groupId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { ok: false, error: "Nicht angemeldet." };

  const group = await getGroup(db, groupId);
  if (!group || !isApplicableGroupStatus(group.status)) {
    return { ok: false, error: "Bei dieser Gruppe kann man sich nicht bewerben." };
  }

  try {
    await changePrimaryGroup(db, me.member.id, groupId, {
      userId: me.user.id,
      grants: me.grants,
    });
    revalidatePath("/account");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

export async function withdrawApplicationAction(): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { ok: false, error: "Nicht angemeldet." };
  try {
    await withdrawGroupChange(db, me.member.id, { userId: me.user.id, grants: me.grants });
    revalidatePath("/account");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
```

Confirm `getGroup`'s exported name and signature in `modules/groups/src/index.ts` before using it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/web/app/account/apply-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the groupless panel**

Create `apps/web/app/account/GrouplessPanel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { Alert, Button, Card } from "@bdas/design-system";

import { applyToGroupAction, withdrawApplicationAction } from "./apply-actions";

export type GroupOption = {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly dormant: boolean;
};

export function GrouplessPanel({
  groups,
  openApplication,
  lastRejection,
}: {
  groups: ReadonlyArray<GroupOption>;
  openApplication: { groupName: string; requestedAt: string } | null;
  lastRejection: { groupName: string; decidedAt: string; category: string; message: string | null } | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Fehler");
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-bdas-ink">Du hast noch keine Gruppe</h1>
        <p className="text-bdas-ink-body">
          Bewirb dich bei einer BDAS-Hochschulgruppe, um Mitglied zu werden.
        </p>
      </div>

      {lastRejection ? (
        <Alert variant="warning" title={`Bewerbung bei ${lastRejection.groupName} abgelehnt`}>
          <span className="flex flex-col gap-2">
            <span>
              {lastRejection.decidedAt} · Grund: <strong>{lastRejection.category}</strong>
            </span>
            {lastRejection.message ? <em>„{lastRejection.message}"</em> : null}
          </span>
        </Alert>
      ) : null}

      {openApplication ? (
        <Alert variant="info" title={`Bewerbung bei ${openApplication.groupName} läuft`}>
          <span className="flex flex-col gap-2">
            <span>Eingereicht am {openApplication.requestedAt}. Der Vorstand entscheidet.</span>
            <span>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => run(withdrawApplicationAction)}
              >
                Bewerbung zurückziehen
              </Button>
            </span>
          </span>
        </Alert>
      ) : null}

      {error ? <p className="text-sm text-bdas-red">{error}</p> : null}

      {!openApplication ? (
        <Card flat className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-bdas-ink">Gruppen</h2>
          <ul className="flex flex-col gap-3">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-4">
                <span>
                  <span className="font-semibold text-bdas-ink">{g.name}</span>{" "}
                  <span className="text-sm text-bdas-ink-muted">{g.city}</span>
                  {g.dormant ? (
                    <span className="ml-2 rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs text-bdas-ink-body">
                      ruhend
                    </span>
                  ) : null}
                </span>
                <Button disabled={pending} onClick={() => run(() => applyToGroupAction(g.id))}>
                  Bewerben
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Wire it into the account page**

In `apps/web/app/account/page.tsx`:

- Replace the `pending` and `active` status alerts and the `STATUS_LABEL` map with: if `me.member.primaryGroupId === null`, render `<GrouplessPanel …>` above the profile card; otherwise render the existing "Mitgliedschaft aktiv" alert.
- Build `lastRejection` from `getGroupChangeHistory(db, me.member.id, selfActor)` — the most recent `rejected` row — and label the category via `REJECTION_CATEGORY_LABELS`.
- Change the group query to `listGroups(db, {})` filtered to `active`/`dormant` in the page, since `listGroups(db, { status: "active" })` would hide dormant groups.
- Keep the profile form, the data export and the logout button exactly as they are.
- Delete the group `<select>` from `ProfileForm` — group choice is now the apply action.

- [ ] **Step 7: Verify by hand**

Run: `pnpm dev`. As a groupless applicant: the page leads with "Du hast noch keine Gruppe" and the group list. Apply → the list is replaced by the running-application alert with a withdraw button. Have a board reject you → the rejection alert shows the category and message, and the group list returns.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/account
git commit -m "feat(web): tailor the account page to having no group

Status blocks render only when they exist, so one page serves a new user,
someone waiting, and someone just rejected."
```

---

## Task 13: Remove the wizard's group picker and the dead module branches

**Files:**
- Modify: `apps/web/app/profil/Wizard.tsx`, `apps/web/app/profil/actions.ts:44-48`
- Modify: `modules/members/src/services/status.ts:58-68`
- Modify: `modules/members/src/services/group-change.ts` (doc comments)

- [ ] **Step 1: Drop the group picker from the wizard**

In `apps/web/app/profil/Wizard.tsx`, remove the group `<select>` and its validation. In `apps/web/app/profil/actions.ts`, remove the `groupId` check and the `changePrimaryGroup` call, keeping the `saveProfile` call. `createProfile` already accepts a null group, so member creation is unaffected.

`saveProfile` currently takes a `groupId` — check whether it needs one. If it does only for the notification that Task 10 moved, drop the parameter.

- [ ] **Step 2: Delete the dead join branch in `transitionStatus`**

In `modules/members/src/services/status.ts`, remove the `from === "pending" && row.primaryGroupId !== null` branch and the now-unused `canDecideJoinRequest` and `groupHasActiveLocalBoard` imports if nothing else in the file uses them. `groupHasActiveLocalBoard` is imported by `group-change.ts`, so keep the export.

Leave `transitionStatus` itself in place with a comment noting it has no app caller until member lifecycle is built.

- [ ] **Step 3: Refresh the stale doc comments**

`changePrimaryGroup`'s header still says a pending member's choice is written straight through. Rewrite it: every member files a request; only leaving applies immediately.

- [ ] **Step 4: Full verification**

Run: `pnpm -r typecheck && pnpm -r lint && pnpm vitest run`
Expected: clean.

Then walk the whole flow in `pnpm dev`: register → complete profile (no group asked) → apply → board rejects with a reason → read the reason on `/account` → apply to a second group → board accepts → land as an active member with the group set.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: separate profile completion from choosing a group

The wizard collects a profile; applying is a later, separate act. Removes
the last caller of the status-based join path."
```

---

## Task 14: Extend the acceptance end-to-end test

**Files:**
- Modify: `e2e/` — add `e2e/applications.e2e.ts`

- [ ] **Step 1: Read an existing spec for the harness idiom**

Run: `ls e2e && sed -n '1,60p' e2e/events.e2e.ts`

Follow its login helper, fixtures and assertions style exactly.

- [ ] **Step 2: Write the end-to-end spec**

Create `e2e/applications.e2e.ts`. Replace `signIn` with whatever helper `events.e2e.ts` uses — the rest is the path this job must protect:

```ts
import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("apply, get rejected with a reason, apply elsewhere, get accepted", async ({ page }) => {
  // 1. A groupless applicant is led to apply.
  await signIn(page, "applicant@example.de");
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Du hast noch keine Gruppe" })).toBeVisible();

  await page
    .getByRole("listitem")
    .filter({ hasText: "BDAS Aachen" })
    .getByRole("button", { name: "Bewerben" })
    .click();
  await expect(page.getByText("Bewerbung bei BDAS Aachen läuft")).toBeVisible();

  // 2. The board rejects with a category and a message.
  await signIn(page, "board-aachen@example.de");
  await page.goto("/gruppe/aachen/bewerbungen");
  await expect(page.getByText("Anna Applicant")).toBeVisible();
  await page.getByRole("button", { name: "Ablehnen …" }).click();
  await page
    .getByLabel("Grund")
    .selectOption({ label: "Kein Kontakt zustande gekommen" });
  await page
    .getByLabel(/Nachricht an die Bewerberin/)
    .fill("Wir haben dich dreimal nicht erreicht.");
  await page.getByRole("button", { name: "Ablehnen", exact: true }).click();
  await expect(page.getByText("Anna Applicant")).toHaveCount(0);

  // 3. The applicant is told why, and can apply again.
  await signIn(page, "applicant@example.de");
  await page.goto("/account");
  await expect(page.getByText("Bewerbung bei BDAS Aachen abgelehnt")).toBeVisible();
  await expect(page.getByText("Kein Kontakt zustande gekommen")).toBeVisible();
  await expect(page.getByText("Wir haben dich dreimal nicht erreicht.")).toBeVisible();

  await page
    .getByRole("listitem")
    .filter({ hasText: "BDAS Berlin" })
    .getByRole("button", { name: "Bewerben" })
    .click();

  // 4. The second board accepts, and the applicant becomes a member.
  await signIn(page, "board-berlin@example.de");
  await page.goto("/gruppe/berlin/bewerbungen");
  await page.getByRole("button", { name: "Aufnehmen" }).click();

  await signIn(page, "applicant@example.de");
  await page.goto("/account");
  await expect(page.getByText("Mitgliedschaft aktiv")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Du hast noch keine Gruppe" })).toHaveCount(0);
});
```

The fixture needs an applicant with a completed profile and no group, plus two groups each with a local board. Seed them the way `events.e2e.ts` seeds its fixtures.

- [ ] **Step 3: Run it**

Run: `pnpm playwright test e2e/applications.e2e.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/applications.e2e.ts
git commit -m "test(e2e): cover apply, reject with reason, reapply, accept"
```

---

## Verification checklist

Before opening the final pull request:

- [ ] `pnpm -r typecheck && pnpm -r lint && pnpm vitest run` all clean
- [ ] `pnpm playwright test` passes, including the pre-existing events spec
- [ ] No `pending` member anywhere holds a `primary_group_id`
- [ ] A rejected applicant can apply again immediately, including to the same group
- [ ] Archiving a group with an open application withdraws it and the applicant is emailed something that does not say "rejected"
- [ ] A local board sees no pool anywhere; the federal board sees it at `/federal/pool` with no date of birth or photo
- [ ] The applicant is never shown who decided
- [ ] Migration `0008` is applied to production and recorded in `_bdas_migrations`
- [ ] The Phase 2 code is deployed, **and only then** `0009_reason_required.sql` is applied and recorded. Applying it earlier breaks every rejection in the live app
