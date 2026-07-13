# Group Transfer Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the self-service group-switch hole — an active member can no longer reassign their `primary_group_id` at will; a switch becomes a *request* decided by the destination group's board, and every switch is recorded as an auditable timeline.

**Architecture:** A new members-owned table `member_group_change_requests` is the single record of every group movement — it is simultaneously the pending queue and the history log (no separate audit table). `updateProfile` stops accepting `primaryGroupId` entirely; a new `changePrimaryGroup` service becomes the only self-service writer of that column and branches on member status: a `pending` member still edits their group freely (nothing has been approved yet), an `active` member files a request, and leaving to "no group" applies immediately (nobody needs to approve an exit) but is still logged. Approval authority mirrors ADR 0021 — the *destination* group's local board decides, federal board only as fallback when that group has no board seat — and approval auto-revokes any group-scoped role grant the member still holds in the group they left.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Components + Server Actions), Drizzle ORM on PostgreSQL, Zod, Vitest against real Postgres (Docker), Tailwind via `@bdas/design-system` tokens.

## Global Constraints

- **Module boundaries (CLAUDE.md §1):** the members module owns `members`, `member_role_grants` and the new `member_group_change_requests`. It must **not** query the `groups` table to validate a destination group — group existence is backstopped by the SQL foreign key and by the fact that the account form's `<select>` is populated from `listGroups`. This matches existing precedent: `createProfile` already accepts a `primaryGroupId` without a cross-module existence check.
- **Public surface (CLAUDE.md §1 rule 8):** only symbols re-exported from `modules/members/src/index.ts` are visible to `apps/web`. Internal files (`services/*`, `schema.ts`, `test-db.ts`) are not importable from outside.
- **Migrations (CLAUDE.md §3):** the new migration lives at `modules/members/migrations/0006_group_change_requests.sql`. `infra/migrations/src/manifest.ts` already lists `members`; files within a module run in lexical order, so **no manifest change is needed**.
- **Design tokens (CLAUDE.md §7):** never inline a hex, radius, shadow or duration. Use the existing `bdas-*` Tailwind classes already used in `MembersTable.tsx` (`rounded-bdas`, `rounded-bdas-sm`, `rounded-bdas-pill`, `border-bdas-soft`, `bg-bdas-surface`, `bg-bdas-surface-hover`, `text-bdas-ink`, `text-bdas-ink-body`, `text-bdas-ink-muted`, `text-bdas-red`, `bg-bdas-red`, `shadow-bdas-card`). The history disclosure uses the canonical `<details>` accordion idiom.
- **UI copy is German**, matching every existing surface in this codebase.
- **Tests ship in the same commit as the code** (CLAUDE.md §4). Integration tests run against real Postgres — no DB mocks.
- **ID prefix:** group change requests use `createId("mgc")`.
- **No new feature flag.** This extends the existing `members` module, which is already flagged and live.
- **Deliberate non-goal:** no email notifications for transfer requests. Typed events are emitted (`members.group_change.*`) so a notifications subscriber can be added later without touching this module.

---

## File Structure

**Created:**
- `docs/decisions/0022-group-transfer-requests.md` — the ADR recording the destination-board rule, the auto-revoke rule, and the request-table-as-log decision.
- `modules/members/migrations/0006_group_change_requests.sql` — the new table.
- `modules/members/src/services/group-change.ts` — write + read services for transfers. Single responsibility: everything that touches `member_group_change_requests`.
- `modules/members/src/test-db.ts` — private test harness (migration list + `createTestDb` wrapper + `createUser`/`createGroup` fixtures), shared by the module's test files.
- `modules/members/src/group-change.test.ts` — integration tests for the new services.
- `apps/web/app/(board)/_components/group-change-actions.ts` — Server Actions: decide a request, lazily load one member's history.
- `apps/web/app/(board)/_components/group-history.ts` — pure view-model builder that merges the member's `joinedAt` and their request rows into a display timeline.
- `apps/web/app/(board)/_components/group-history.test.ts` — unit tests for that pure builder.
- `apps/web/app/(board)/_components/MemberGroupPanel.tsx` — the aside's transfer block: pending request + decide buttons + `<details>` history accordion.
- `apps/web/app/account/WithdrawChangeButton.tsx` — client button that withdraws the member's own open request.

**Modified:**
- `modules/members/src/schema.ts` — add the `memberGroupChangeRequests` table.
- `modules/members/src/types.ts` — add `GroupChangeStatus`, `GroupChangeRequest`, `GroupChangeResult`, `OpenGroupChange`.
- `modules/members/src/events.ts` — add three events + widen the `MembersEvent` union.
- `modules/members/src/services/status.ts` — export `groupHasActiveLocalBoard` (module-internal reuse; not re-exported from `index.ts`).
- `modules/members/src/services/profile.ts` — **remove `primaryGroupId` from `UpdateProfileInput`** and stop writing the column in `updateProfile`. This is the hole being closed.
- `modules/members/src/index.ts` — re-export the new public surface.
- `modules/members/src/index.test.ts` — use the shared migration list; add a regression test that `updateProfile` can no longer move a member.
- `modules/members/README.md` — document the transfer flow.
- `apps/web/app/account/actions.ts` — route group changes through `changePrimaryGroup`; add `withdrawGroupChangeAction`.
- `apps/web/app/account/page.tsx` — load the open request; render the "applying for another group" state.
- `apps/web/app/account/ProfileForm.tsx` — hint under the select when a request is open.
- `apps/web/app/(board)/_components/MembersTable.tsx` — flag rows with an open transfer; mount `MemberGroupPanel` in the aside.
- `apps/web/app/(board)/federal/members/page.tsx` — pass open transfers.
- `apps/web/app/(board)/gruppe/[slug]/members/page.tsx` — pass open transfers + all group names (the aside needs to name a destination group that isn't this one).

---

## Task 1: Schema, types, events, and the shared test harness

**Files:**
- Create: `docs/decisions/0022-group-transfer-requests.md`
- Create: `modules/members/migrations/0006_group_change_requests.sql`
- Create: `modules/members/src/test-db.ts`
- Create: `modules/members/src/group-change.test.ts`
- Modify: `modules/members/src/schema.ts`
- Modify: `modules/members/src/types.ts`
- Modify: `modules/members/src/events.ts`
- Modify: `modules/members/src/index.test.ts` (migration list only)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - table `member_group_change_requests`
  - `memberGroupChangeRequests` (Drizzle table), `MemberGroupChangeRow` (row type)
  - `GroupChangeStatus = "pending" | "approved" | "rejected" | "withdrawn"`
  - `GroupChangeRequest = { id, memberId, fromGroupId: string | null, toGroupId: string | null, status, requestedAt: Date, decidedAt: Date | null, decidedBy: string | null }`
  - `GroupChangeResult = { kind: "applied"; member: Member } | { kind: "requested"; request: GroupChangeRequest }`
  - `OpenGroupChange = GroupChangeRequest & { canDecide: boolean }`
  - events `GroupChangeRequested`, `GroupChangeDecided`, `GroupChangeWithdrawn`
  - `MEMBERS_TEST_MIGRATIONS`, `setupMembersDb()`, `createUser()`, `createGroup()` from `test-db.ts`

- [ ] **Step 1: Write the ADR**

Create `docs/decisions/0022-group-transfer-requests.md`:

```markdown
# ADR 0022 — Group transfers are requests, decided by the destination board

**Status:** Accepted
**Date:** 2026-07-13
**Supersedes:** nothing. **Amends:** the members module's profile surface.

## Context

`updateProfile` accepted `primaryGroupId` and wrote it with no authorization and
no status change. The `/account` form exposed a `<select>` of every active group
in the federation, so any member could reassign themselves to any group in one
POST: no approval, no re-entry into the pending queue, no notification to either
board. Because `modules/files/src/permissions.ts` grants folder access on
`status === "active" && primaryGroupId === folder.groupId`, this was a
self-serve path into another group's private documents.

## Decision

1. **A group change is a request, not an edit.** `member_group_change_requests`
   records every movement. Its rows *are* the audit log — there is no second
   history table. A row's terminal state is `approved`, `rejected` or
   `withdrawn`; at most one `pending` row may exist per member (partial unique
   index).
2. **The destination group's board decides.** This mirrors ADR 0021: a join
   decision belongs to the group being joined. `canDecideJoinRequest` is reused
   verbatim against `to_group_id`, including its federal-board fallback for a
   destination group with zero active local-board seats. The origin group is
   *notified* (the request is visible in its members list) but has no veto — a
   member cannot be held hostage by the group they are leaving.
3. **Approval auto-revokes group-scoped grants in the origin group.** Any active
   `local_board`, `local_board_lead` or `event_organizer` grant scoped to
   `from_group_id` is revoked in the same transaction, with the deciding user
   recorded as revoker and a `members.role.revoked` event per grant. Unscoped
   (federal) grants are untouched. Keeping board powers over a group you left is
   the same escalation class as the bug this ADR closes.
4. **Pending members still edit their group freely.** Nothing has been approved
   yet, so there is nothing to re-approve; their join request simply moves to the
   other group's queue.
5. **Leaving to no group applies immediately.** Nobody needs to approve an exit.
   It is still written to the log as an auto-approved row (`to_group_id NULL`)
   and it revokes origin-group grants like any other departure.
6. **Self-service only.** `changePrimaryGroup` requires `actor.userId` to equal
   the member's `user_id`. Board-initiated moves are out of scope; a board acts
   by deciding requests.

## Consequences

- `UpdateProfileInput` no longer carries `primaryGroupId`. `updateProfile` is a
  names-only service. Any future caller wanting to move a member must go through
  `changePrimaryGroup` (self) or `decideGroupChange` (board).
- `joinedAt` keeps its meaning: the date the member joined *the federation*, not
  their current group. The group timeline derives the initial join from it.
- The members module still performs no existence check on a destination group —
  the SQL foreign key backstops it. Querying `groups` from the members module
  would violate CLAUDE.md §1 rule 1.
```

- [ ] **Step 2: Write the migration**

Create `modules/members/migrations/0006_group_change_requests.sql`:

```sql
-- Members module — group transfer requests (ADR 0022).
--
-- One row per group movement. The table is both the pending queue and the
-- history log: `pending` rows await a decision by the DESTINATION group's board,
-- terminal rows (`approved` / `rejected` / `withdrawn`) are the audit trail.
--
-- `to_group_id` NULL ⇔ the member left the group structure entirely; such a row
-- is written already `approved` (an exit needs no approval).
-- `from_group_id` NULL ⇔ the member had no group (first group after signup).
CREATE TABLE member_group_change_requests (
  id            TEXT PRIMARY KEY,
  member_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  from_group_id TEXT REFERENCES groups(id),
  to_group_id   TEXT REFERENCES groups(id),
  status        TEXT NOT NULL DEFAULT 'pending',
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,
  decided_by    TEXT,
  CONSTRAINT member_group_change_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  -- A row is decided iff it is no longer pending.
  CONSTRAINT member_group_change_requests_decided_check
    CHECK ((status = 'pending') = (decided_at IS NULL)),
  -- Only an exit may be groupless, and a move must actually move.
  CONSTRAINT member_group_change_requests_moves_check
    CHECK (from_group_id IS DISTINCT FROM to_group_id)
);

-- At most one open request per member.
CREATE UNIQUE INDEX member_group_change_requests_open_uq
  ON member_group_change_requests (member_id)
  WHERE status = 'pending';

CREATE INDEX member_group_change_requests_member_idx
  ON member_group_change_requests (member_id);

-- The destination board's queue.
CREATE INDEX member_group_change_requests_to_group_idx
  ON member_group_change_requests (to_group_id)
  WHERE status = 'pending';

-- The origin group's view of members leaving.
CREATE INDEX member_group_change_requests_from_group_idx
  ON member_group_change_requests (from_group_id)
  WHERE status = 'pending';
```

- [ ] **Step 3: Add the Drizzle table**

Append to `modules/members/src/schema.ts` (the file already imports `index`, `pgTable`, `text`, `timestamp`, `uniqueIndex` and `sql` — no import changes needed):

```ts
/**
 * Group transfer requests (ADR 0022). Both the pending queue and the audit log:
 * `pending` rows await the DESTINATION group's board; terminal rows are history.
 * `toGroupId` NULL ⇔ an exit (written already `approved`).
 */
export const memberGroupChangeRequests = pgTable(
  "member_group_change_requests",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull(),
    fromGroupId: text("from_group_id"),
    toGroupId: text("to_group_id"),
    status: text("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
  },
  (t) => ({
    openUq: uniqueIndex("member_group_change_requests_open_uq")
      .on(t.memberId)
      .where(sql`${t.status} = 'pending'`),
    memberIdx: index("member_group_change_requests_member_idx").on(t.memberId),
    toGroupIdx: index("member_group_change_requests_to_group_idx")
      .on(t.toGroupId)
      .where(sql`${t.status} = 'pending'`),
    fromGroupIdx: index("member_group_change_requests_from_group_idx")
      .on(t.fromGroupId)
      .where(sql`${t.status} = 'pending'`),
  }),
);

export type MemberGroupChangeRow = typeof memberGroupChangeRequests.$inferSelect;
```

- [ ] **Step 4: Add the types**

Append to `modules/members/src/types.ts`:

```ts
export type GroupChangeStatus = "pending" | "approved" | "rejected" | "withdrawn";

/**
 * One recorded group movement (ADR 0022). `fromGroupId` null ⇔ the member had no
 * group; `toGroupId` null ⇔ the member left the group structure (always
 * `approved` on write — an exit needs no decision).
 */
export type GroupChangeRequest = {
  readonly id: string;
  readonly memberId: string;
  readonly fromGroupId: string | null;
  readonly toGroupId: string | null;
  readonly status: GroupChangeStatus;
  readonly requestedAt: Date;
  readonly decidedAt: Date | null;
  readonly decidedBy: string | null;
};

/**
 * What `changePrimaryGroup` did: wrote the column straight through (`applied` —
 * a pending member editing their choice, or any member leaving), or filed a
 * request for the destination board (`requested`).
 */
export type GroupChangeResult =
  | { readonly kind: "applied"; readonly member: Member }
  | { readonly kind: "requested"; readonly request: GroupChangeRequest };

/** An open request plus whether *this* actor may decide it. */
export type OpenGroupChange = GroupChangeRequest & { readonly canDecide: boolean };
```

- [ ] **Step 5: Add the events**

In `modules/members/src/events.ts`, append the three types and widen the union:

```ts
export type GroupChangeRequested = {
  readonly type: "members.group_change.requested";
  readonly requestId: string;
  readonly memberId: string;
  readonly fromGroupId: string | null;
  readonly toGroupId: string;
  readonly at: Date;
};

export type GroupChangeDecided = {
  readonly type: "members.group_change.decided";
  readonly requestId: string;
  readonly memberId: string;
  readonly fromGroupId: string | null;
  readonly toGroupId: string | null;
  readonly decision: "approved" | "rejected";
  readonly actorUserId: string;
  readonly at: Date;
};

export type GroupChangeWithdrawn = {
  readonly type: "members.group_change.withdrawn";
  readonly requestId: string;
  readonly memberId: string;
  readonly actorUserId: string;
  readonly at: Date;
};
```

Replace the existing union with:

```ts
export type MembersEvent =
  | ProfileCreated
  | ProfileUpdated
  | StatusChanged
  | RoleGranted
  | RoleRevoked
  | GroupChangeRequested
  | GroupChangeDecided
  | GroupChangeWithdrawn;
```

- [ ] **Step 6: Extract the shared test harness**

Create `modules/members/src/test-db.ts`:

```ts
/**
 * Private test harness for the members module. Not re-exported from index.ts.
 * Pulls in the auth + groups migrations because the members tables FK both.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { createTestDb, type TestDb } from "@bdas/db/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

/** Migration files, in apply order. Append new members migrations here. */
export const MEMBERS_TEST_MIGRATIONS: ReadonlyArray<ReadonlyArray<string>> = [
  ["..", "..", "auth", "migrations", "0001_init.sql"],
  ["..", "..", "groups", "migrations", "0001_init.sql"],
  ["..", "migrations", "0001_init.sql"],
  ["..", "migrations", "0002_role_grants.sql"],
  ["..", "migrations", "0003_local_board_lead.sql"],
  ["..", "migrations", "0004_revoked_by.sql"],
  ["..", "migrations", "0005_event_organizer.sql"],
  ["..", "migrations", "0006_group_change_requests.sql"],
];

export async function dbReachable(): Promise<boolean> {
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

/** Fresh schema with every members migration applied. */
export async function setupMembersDb(): Promise<TestDb> {
  const t = await createTestDb();
  for (const file of MEMBERS_TEST_MIGRATIONS) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
  return t;
}

export async function createUser(t: TestDb, id: string, email: string): Promise<void> {
  await t.client`
    INSERT INTO auth_users (id, email_normalized, email_display, status)
    VALUES (${id}, ${email}, ${email}, 'active')
  `;
}

export async function createGroup(t: TestDb, id: string, slug: string): Promise<void> {
  await t.client`
    INSERT INTO groups (id, slug, name, city, status)
    VALUES (${id}, ${slug}, ${slug}, 'Teststadt', 'active')
  `;
}
```

- [ ] **Step 7: Point the existing test file at the shared migration list**

In `modules/members/src/index.test.ts`, add the import:

```ts
import { MEMBERS_TEST_MIGRATIONS } from "./test-db";
```

and replace the inline array literal in `beforeEach` — the whole `for (const file of [ ... ])` header becomes:

```ts
    for (const file of MEMBERS_TEST_MIGRATIONS) {
```

Leave the rest of that `beforeEach` (the `fs.readFile` + `t.client.unsafe(sql)` body, `resetEventBus()`) untouched. This is the only change to `index.test.ts` in this task; the file's local `dbReachable`/`createUser`/`createGroup` stay as they are (do not refactor them — CLAUDE.md §6).

- [ ] **Step 8: Write the failing schema test**

Create `modules/members/src/group-change.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

describeIfDb("group change requests — schema", () => {
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
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_cem', 'usr_cem', 'Cem', 'Colak', 'grp_a', 'active')
    `;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("allows at most one open request per member", async () => {
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
      VALUES ('mgc_1', 'mem_cem', 'grp_a', 'grp_b')
    `;
    await expect(
      t.client`
        INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
        VALUES ('mgc_2', 'mem_cem', 'grp_a', 'grp_b')
      `,
    ).rejects.toThrow();
  });

  it("allows a second request once the first is terminal", async () => {
    await t.client`
      INSERT INTO member_group_change_requests
        (id, member_id, from_group_id, to_group_id, status, decided_at, decided_by)
      VALUES ('mgc_1', 'mem_cem', 'grp_a', 'grp_b', 'withdrawn', now(), 'usr_cem')
    `;
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
      VALUES ('mgc_2', 'mem_cem', 'grp_a', 'grp_b')
    `;
    const rows = await t.client`SELECT id FROM member_group_change_requests`;
    expect(rows.length).toBe(2);
  });

  it("rejects a pending row that is already decided", async () => {
    await expect(
      t.client`
        INSERT INTO member_group_change_requests
          (id, member_id, from_group_id, to_group_id, status, decided_at)
        VALUES ('mgc_1', 'mem_cem', 'grp_a', 'grp_b', 'pending', now())
      `,
    ).rejects.toThrow();
  });

  it("rejects a request that does not move the member", async () => {
    await expect(
      t.client`
        INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
        VALUES ('mgc_1', 'mem_cem', 'grp_a', 'grp_a')
      `,
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `pnpm --filter @bdas/members test -- group-change`
Expected: FAIL — `relation "member_group_change_requests" does not exist` if the migration wasn't picked up, or a missing-module error for `./test-db`. (If Postgres isn't running locally, start it first: `docker compose up -d db`. A skipped suite is **not** a pass — the tests must actually run.)

- [ ] **Step 10: Run the test to verify it passes**

With Steps 2/6 in place, run: `pnpm --filter @bdas/members test -- group-change`
Expected: PASS, 4 tests.

Then confirm nothing regressed: `pnpm --filter @bdas/members test`
Expected: PASS, all existing tests green.

- [ ] **Step 11: Typecheck and commit**

Run: `pnpm --filter @bdas/members typecheck`
Expected: no errors.

```bash
git add docs/decisions/0022-group-transfer-requests.md \
        modules/members/migrations/0006_group_change_requests.sql \
        modules/members/src/schema.ts \
        modules/members/src/types.ts \
        modules/members/src/events.ts \
        modules/members/src/test-db.ts \
        modules/members/src/group-change.test.ts \
        modules/members/src/index.test.ts
git commit -m "feat(members): group_change_requests table, types, events (ADR 0022)"
```

---

## Task 2: `changePrimaryGroup` + `withdrawGroupChange` (the self-service write path)

**Files:**
- Create: `modules/members/src/services/group-change.ts`
- Modify: `modules/members/src/services/status.ts` (export one helper)
- Test: `modules/members/src/group-change.test.ts`

**Interfaces:**
- Consumes: `memberGroupChangeRequests`, `MemberGroupChangeRow` (Task 1); `GroupChangeRequest`, `GroupChangeResult` (Task 1); `GroupChangeRequested`, `GroupChangeDecided`, `GroupChangeWithdrawn` (Task 1); the existing `Actor`, `row2member`, `members`, `memberRoleGrants`.
- Produces:
  - `changePrimaryGroup(db: Db, memberId: string, toGroupId: string | null, actor: Actor): Promise<GroupChangeResult>`
  - `withdrawGroupChange(db: Db, memberId: string, actor: Actor): Promise<GroupChangeRequest | null>`
  - `row2request(r: MemberGroupChangeRow): GroupChangeRequest` (internal, used by Task 4)
  - `revokeGroupScopedGrants(tx, memberId, groupId, actorUserId)` (internal, used by Task 3)
  - `groupHasActiveLocalBoard` exported from `status.ts` (internal, used by Task 3)

- [ ] **Step 1: Export the local-board probe from `status.ts`**

In `modules/members/src/services/status.ts`, change the helper's declaration from `async function groupHasActiveLocalBoard(` to:

```ts
export async function groupHasActiveLocalBoard(tx: Db, groupId: string): Promise<boolean> {
```

Leave its body and its doc comment unchanged. It stays module-private (it is **not** added to `index.ts`).

- [ ] **Step 2: Write the failing tests**

Append to `modules/members/src/group-change.test.ts`:

```ts
import { getEventBus, resetEventBus as _reset } from "@bdas/events";

import { changePrimaryGroup, withdrawGroupChange } from "./services/group-change";
import { createProfile } from "./services/profile";
import { approveMember } from "./services/status";
import { grantRole } from "./services/roles";
import { getMember } from "./services/get";
import type { Grant, MembersEvent } from "./index";

const FEDERAL = {
  userId: "usr_federal",
  grants: [{ role: "federal_board", groupId: null }] as ReadonlyArray<Grant>,
};
const self = (userId: string) => ({
  userId,
  grants: [{ role: "member", groupId: null }] as ReadonlyArray<Grant>,
});

describeIfDb("changePrimaryGroup", () => {
  let t: TestDb;
  let events: MembersEvent[];

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    events = [];
    getEventBus().subscribe((e) => {
      events.push(e as MembersEvent);
    });
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** An approved, active member of grp_a. */
  async function activeMember(userId: string): Promise<string> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Test",
      lastName: "Person",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, FEDERAL);
    return m.id;
  }

  it("files a request for an active member instead of moving them", async () => {
    const id = await activeMember("usr_active");
    const res = await changePrimaryGroup(t.db, id, "grp_b", self("usr_active"));

    expect(res.kind).toBe("requested");
    if (res.kind !== "requested") throw new Error("unreachable");
    expect(res.request.fromGroupId).toBe("grp_a");
    expect(res.request.toGroupId).toBe("grp_b");
    expect(res.request.status).toBe("pending");

    const after = await getMember(t.db, id);
    expect(after?.primaryGroupId).toBe("grp_a"); // NOT moved
    expect(after?.status).toBe("active");
    expect(events.some((e) => e.type === "members.group_change.requested")).toBe(true);
  });

  it("moves a pending member straight through — nothing was approved yet", async () => {
    await createUser(t, "usr_pending", "pending@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_pending",
      firstName: "Noch",
      lastName: "Wartend",
      primaryGroupId: "grp_a",
    });

    const res = await changePrimaryGroup(t.db, m.id, "grp_b", self("usr_pending"));

    expect(res.kind).toBe("applied");
    const after = await getMember(t.db, m.id);
    expect(after?.primaryGroupId).toBe("grp_b");
    expect(after?.status).toBe("pending");
    const rows = await t.client`SELECT id FROM member_group_change_requests`;
    expect(rows.length).toBe(0); // no request row for a pending member
  });

  it("applies an exit immediately, logs it, and revokes origin-group grants", async () => {
    const id = await activeMember("usr_leaver");
    await grantRole(t.db, id, "local_board", FEDERAL, "grp_a");

    const res = await changePrimaryGroup(t.db, id, null, self("usr_leaver"));

    expect(res.kind).toBe("applied");
    const after = await getMember(t.db, id);
    expect(after?.primaryGroupId).toBeNull();

    const [logged] = await t.client`
      SELECT status, from_group_id, to_group_id FROM member_group_change_requests
    `;
    expect(logged?.["status"]).toBe("approved");
    expect(logged?.["from_group_id"]).toBe("grp_a");
    expect(logged?.["to_group_id"]).toBeNull();

    const grants = await t.client`
      SELECT revoked_at FROM member_role_grants WHERE member_id = ${id} AND role = 'local_board'
    `;
    expect(grants[0]?.["revoked_at"]).not.toBeNull();
  });

  it("supersedes an open request when the member picks a different group", async () => {
    const id = await activeMember("usr_fickle");
    await createGroup(t, "grp_c", "koeln");

    const first = await changePrimaryGroup(t.db, id, "grp_b", self("usr_fickle"));
    const second = await changePrimaryGroup(t.db, id, "grp_c", self("usr_fickle"));

    expect(second.kind).toBe("requested");
    if (first.kind !== "requested" || second.kind !== "requested") throw new Error("unreachable");

    const rows = await t.client`
      SELECT id, status FROM member_group_change_requests ORDER BY requested_at
    `;
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r["id"] === first.request.id)?.["status"]).toBe("withdrawn");
    expect(rows.find((r) => r["id"] === second.request.id)?.["status"]).toBe("pending");
  });

  it("re-picking the current group withdraws the open request", async () => {
    const id = await activeMember("usr_reverter");
    await changePrimaryGroup(t.db, id, "grp_b", self("usr_reverter"));

    const res = await changePrimaryGroup(t.db, id, "grp_a", self("usr_reverter"));

    expect(res.kind).toBe("applied");
    const [row] = await t.client`SELECT status FROM member_group_change_requests`;
    expect(row?.["status"]).toBe("withdrawn");
    expect(events.some((e) => e.type === "members.group_change.withdrawn")).toBe(true);
  });

  it("withdrawGroupChange cancels the member's own open request", async () => {
    const id = await activeMember("usr_withdrawer");
    await changePrimaryGroup(t.db, id, "grp_b", self("usr_withdrawer"));

    const withdrawn = await withdrawGroupChange(t.db, id, self("usr_withdrawer"));
    expect(withdrawn?.status).toBe("withdrawn");

    const again = await withdrawGroupChange(t.db, id, self("usr_withdrawer"));
    expect(again).toBeNull(); // idempotent
  });

  it("refuses to move a member on someone else's behalf", async () => {
    const id = await activeMember("usr_victim");

    await expect(changePrimaryGroup(t.db, id, "grp_b", FEDERAL)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      changePrimaryGroup(t.db, id, "grp_b", self("usr_attacker")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a transfer for an inactive member", async () => {
    const id = await activeMember("usr_gone");
    await transitionStatus(t.db, id, "inactive", FEDERAL);

    await expect(changePrimaryGroup(t.db, id, "grp_b", self("usr_gone"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
```

Add `transitionStatus` to the existing `./services/status` import at the top of the file so the last test compiles.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @bdas/members test -- group-change`
Expected: FAIL — `Cannot find module './services/group-change'`.

- [ ] **Step 4: Write the service**

Create `modules/members/src/services/group-change.ts`:

```ts
/**
 * Group transfers (ADR 0022). The ONLY self-service writer of
 * `members.primary_group_id`.
 *
 * An active member cannot move themselves: they file a request that the
 * DESTINATION group's board decides (ADR 0021's rule, applied to transfers).
 * A pending member has nothing approved yet, so their choice is written
 * straight through. Leaving to no group applies immediately — nobody needs to
 * approve an exit — but is still logged.
 *
 * The module deliberately does not verify that a destination group exists; the
 * foreign key does that. Reading the `groups` table from here would violate
 * CLAUDE.md §1 rule 1.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { Role } from "@bdas/auth";
import { ConflictError, ForbiddenError, NotFoundError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type {
  GroupChangeDecided,
  GroupChangeRequested,
  GroupChangeWithdrawn,
  RoleRevoked,
} from "../events";
import { memberGroupChangeRequests, members, memberRoleGrants } from "../schema";
import type {
  GroupChangeRequest,
  GroupChangeResult,
  GroupChangeStatus,
  MemberStatus,
} from "../types";
import type { MemberGroupChangeRow } from "../schema";

import { row2member } from "./get";
import type { Actor, Db } from "./status";

export type { Db };

export function row2request(r: MemberGroupChangeRow): GroupChangeRequest {
  return {
    id: r.id,
    memberId: r.memberId,
    fromGroupId: r.fromGroupId,
    toGroupId: r.toGroupId,
    status: r.status as GroupChangeStatus,
    requestedAt: r.requestedAt,
    decidedAt: r.decidedAt,
    decidedBy: r.decidedBy,
  };
}

/**
 * Revoke every active grant the member holds *scoped to `groupId`* — the group
 * they are leaving (ADR 0022). Unscoped (federal) grants are untouched. Emits a
 * `members.role.revoked` per grant so notifications behave as if a board had
 * revoked it by hand.
 */
export async function revokeGroupScopedGrants(
  tx: Db,
  memberId: string,
  groupId: string,
  actorUserId: string,
): Promise<void> {
  const revoked = await tx
    .update(memberRoleGrants)
    .set({ revokedAt: sql`now()`, revokedBy: actorUserId })
    .where(
      and(
        eq(memberRoleGrants.memberId, memberId),
        eq(memberRoleGrants.groupId, groupId),
        isNull(memberRoleGrants.revokedAt),
      ),
    )
    .returning({ role: memberRoleGrants.role, groupId: memberRoleGrants.groupId });

  for (const g of revoked) {
    const event: RoleRevoked = {
      type: "members.role.revoked",
      memberId,
      role: g.role as Role,
      groupId: g.groupId,
      actorUserId,
      at: new Date(),
    };
    await getEventBus().publish(event);
  }
}

/** Close the member's open request, if any. Returns it, or null when there was none. */
async function withdrawOpen(
  tx: Db,
  memberId: string,
  actorUserId: string,
): Promise<GroupChangeRequest | null> {
  const [row] = await tx
    .update(memberGroupChangeRequests)
    .set({ status: "withdrawn", decidedAt: new Date(), decidedBy: actorUserId })
    .where(
      and(
        eq(memberGroupChangeRequests.memberId, memberId),
        eq(memberGroupChangeRequests.status, "pending"),
      ),
    )
    .returning();
  if (!row) return null;

  const event: GroupChangeWithdrawn = {
    type: "members.group_change.withdrawn",
    requestId: row.id,
    memberId,
    actorUserId,
    at: new Date(),
  };
  await getEventBus().publish(event);
  return row2request(row);
}

/**
 * Self-service group change. `toGroupId` null ⇔ leave the group structure.
 * The actor must be the member themselves; a board moves people by deciding
 * requests, never by writing the column.
 */
export async function changePrimaryGroup(
  db: Db,
  memberId: string,
  toGroupId: string | null,
  actor: Actor,
): Promise<GroupChangeResult> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(members).where(eq(members.id, memberId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mitglied nicht gefunden.");
    if (row.userId !== actor.userId) {
      throw new ForbiddenError("Nur das Mitglied selbst kann seine Gruppe wechseln.");
    }

    const status = row.status as MemberStatus;
    if (status !== "pending" && status !== "active") {
      throw new ForbiddenError("Nur aktive Mitglieder können die Gruppe wechseln.");
    }

    const from = row.primaryGroupId;

    // Re-picking the current group means "never mind" — cancel any open request.
    if (toGroupId === from) {
      await withdrawOpen(tx, memberId, actor.userId);
      return { kind: "applied", member: row2member(row) };
    }

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

    // Leaving needs no approval, but is logged and drops origin-group powers.
    if (toGroupId === null) {
      await withdrawOpen(tx, memberId, actor.userId);
      const [updated] = await tx
        .update(members)
        .set({ primaryGroupId: null, updatedAt: new Date() })
        .where(eq(members.id, memberId))
        .returning();
      if (!updated) throw new Error("changePrimaryGroup: update returned no row");
      if (from !== null) await revokeGroupScopedGrants(tx, memberId, from, actor.userId);

      const id = createId("mgc");
      const now = new Date();
      await tx.insert(memberGroupChangeRequests).values({
        id,
        memberId,
        fromGroupId: from,
        toGroupId: null,
        status: "approved",
        decidedAt: now,
        decidedBy: actor.userId,
      });
      const event: GroupChangeDecided = {
        type: "members.group_change.decided",
        requestId: id,
        memberId,
        fromGroupId: from,
        toGroupId: null,
        decision: "approved",
        actorUserId: actor.userId,
        at: now,
      };
      await getEventBus().publish(event);

      return { kind: "applied", member: row2member(updated) };
    }

    // Joining another group: the destination board decides. A second pick
    // supersedes the first (the partial unique index allows one open row).
    await withdrawOpen(tx, memberId, actor.userId);
    const id = createId("mgc");
    const [request] = await tx
      .insert(memberGroupChangeRequests)
      .values({ id, memberId, fromGroupId: from, toGroupId })
      .returning();
    if (!request) throw new Error("changePrimaryGroup: insert returned no row");

    const event: GroupChangeRequested = {
      type: "members.group_change.requested",
      requestId: id,
      memberId,
      fromGroupId: from,
      toGroupId,
      at: new Date(),
    };
    await getEventBus().publish(event);

    return { kind: "requested", request: row2request(request) };
  });
}

/** The member cancels their own open request. Idempotent: null when none was open. */
export async function withdrawGroupChange(
  db: Db,
  memberId: string,
  actor: Actor,
): Promise<GroupChangeRequest | null> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(members).where(eq(members.id, memberId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mitglied nicht gefunden.");
    if (row.userId !== actor.userId) {
      throw new ForbiddenError("Nur das Mitglied selbst kann seinen Antrag zurückziehen.");
    }
    return withdrawOpen(tx, memberId, actor.userId);
  });
}
```

Note: `ConflictError` and `desc` are imported here for Tasks 3 and 4, which extend this file. If your linter fails on unused imports at this commit, add them in Task 3/4 instead.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @bdas/members test -- group-change`
Expected: PASS — the 4 schema tests plus the 8 `changePrimaryGroup` tests.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `pnpm --filter @bdas/members typecheck && pnpm lint`
Expected: no errors.

```bash
git add modules/members/src/services/group-change.ts \
        modules/members/src/services/status.ts \
        modules/members/src/group-change.test.ts
git commit -m "feat(members): changePrimaryGroup files a transfer request instead of moving the member"
```

---

## Task 3: `decideGroupChange` — destination board approves or rejects

**Files:**
- Modify: `modules/members/src/services/group-change.ts`
- Test: `modules/members/src/group-change.test.ts`

**Interfaces:**
- Consumes: `revokeGroupScopedGrants`, `row2request`, `withdrawOpen` (Task 2); `groupHasActiveLocalBoard` (Task 2 Step 1); `canDecideJoinRequest` from `../roles`.
- Produces: `decideGroupChange(db: Db, requestId: string, decision: "approved" | "rejected", actor: Actor): Promise<GroupChangeRequest>`

- [ ] **Step 1: Write the failing tests**

Append to `modules/members/src/group-change.test.ts`:

```ts
describeIfDb("decideGroupChange", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  const boardOf = (userId: string, groupId: string) => ({
    userId,
    grants: [{ role: "local_board", groupId }] as ReadonlyArray<Grant>,
  });

  /** An active member of grp_a with an open request to grp_b. */
  async function pendingTransfer(userId: string): Promise<{ memberId: string; requestId: string }> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Test",
      lastName: "Person",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, FEDERAL);
    const res = await changePrimaryGroup(t.db, m.id, "grp_b", self(userId));
    if (res.kind !== "requested") throw new Error("expected a request");
    return { memberId: m.id, requestId: res.request.id };
  }

  /** grp_b needs a local board for the fallback rule to be off. */
  async function giveBoardSeat(userId: string, groupId: string): Promise<void> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Board",
      lastName: "Person",
      primaryGroupId: groupId,
    });
    await approveMember(t.db, m.id, FEDERAL);
    await grantRole(t.db, m.id, "local_board", FEDERAL, groupId);
  }

  it("approves: moves the member and closes the request", async () => {
    const { memberId, requestId } = await pendingTransfer("usr_mover");
    await giveBoardSeat("usr_b_board", "grp_b");

    const decided = await decideGroupChange(
      t.db,
      requestId,
      "approved",
      boardOf("usr_b_board", "grp_b"),
    );

    expect(decided.status).toBe("approved");
    expect(decided.decidedBy).toBe("usr_b_board");
    const after = await getMember(t.db, memberId);
    expect(after?.primaryGroupId).toBe("grp_b");
    expect(after?.status).toBe("active"); // status untouched
  });

  it("approves: revokes grants scoped to the group left behind", async () => {
    const { memberId, requestId } = await pendingTransfer("usr_exboard");
    await grantRole(t.db, memberId, "local_board", FEDERAL, "grp_a");
    await giveBoardSeat("usr_b_board", "grp_b");

    await decideGroupChange(t.db, requestId, "approved", boardOf("usr_b_board", "grp_b"));

    const grants = await t.client`
      SELECT revoked_at, revoked_by FROM member_role_grants
      WHERE member_id = ${memberId} AND group_id = 'grp_a'
    `;
    expect(grants[0]?.["revoked_at"]).not.toBeNull();
    expect(grants[0]?.["revoked_by"]).toBe("usr_b_board");
  });

  it("rejects: closes the request and leaves the member where they were", async () => {
    const { memberId, requestId } = await pendingTransfer("usr_rejected");
    await giveBoardSeat("usr_b_board", "grp_b");

    const decided = await decideGroupChange(
      t.db,
      requestId,
      "rejected",
      boardOf("usr_b_board", "grp_b"),
    );

    expect(decided.status).toBe("rejected");
    const after = await getMember(t.db, memberId);
    expect(after?.primaryGroupId).toBe("grp_a");
  });

  it("the ORIGIN group's board may not decide — only the destination's", async () => {
    const { requestId } = await pendingTransfer("usr_held");
    await giveBoardSeat("usr_a_board", "grp_a");
    await giveBoardSeat("usr_b_board", "grp_b");

    await expect(
      decideGroupChange(t.db, requestId, "rejected", boardOf("usr_a_board", "grp_a")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("federal board may not decide when the destination has its own board", async () => {
    const { requestId } = await pendingTransfer("usr_fed");
    await giveBoardSeat("usr_b_board", "grp_b");

    await expect(decideGroupChange(t.db, requestId, "approved", FEDERAL)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("federal board decides as fallback when the destination has no board", async () => {
    const { memberId, requestId } = await pendingTransfer("usr_orphan");

    const decided = await decideGroupChange(t.db, requestId, "approved", FEDERAL);

    expect(decided.status).toBe("approved");
    const after = await getMember(t.db, memberId);
    expect(after?.primaryGroupId).toBe("grp_b");
  });

  it("a second decision on the same request conflicts", async () => {
    const { requestId } = await pendingTransfer("usr_twice");
    await giveBoardSeat("usr_b_board", "grp_b");

    await decideGroupChange(t.db, requestId, "approved", boardOf("usr_b_board", "grp_b"));
    await expect(
      decideGroupChange(t.db, requestId, "rejected", boardOf("usr_b_board", "grp_b")),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
```

Add `decideGroupChange` to the `./services/group-change` import at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bdas/members test -- group-change`
Expected: FAIL — `decideGroupChange is not a function` / not exported.

- [ ] **Step 3: Implement `decideGroupChange`**

Append to `modules/members/src/services/group-change.ts`, and add `canDecideJoinRequest` + `groupHasActiveLocalBoard` to the imports:

```ts
import { canDecideJoinRequest } from "../roles";
import { groupHasActiveLocalBoard } from "./status";
```

```ts
/**
 * The DESTINATION group's board decides (ADR 0022, applying ADR 0021's rule to
 * transfers): a `local_board`/`local_board_lead` scoped to `to_group_id`, with
 * federal board as the fallback only when that group has no active board seat.
 * The origin group has no veto.
 *
 * Approval moves the member and revokes any grant they still hold in the group
 * they left. Rejection leaves them exactly where they were. Status is never
 * touched — an approved transfer does not send anyone back to `pending`.
 */
export async function decideGroupChange(
  db: Db,
  requestId: string,
  decision: "approved" | "rejected",
  actor: Actor,
): Promise<GroupChangeRequest> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(memberGroupChangeRequests)
      .where(eq(memberGroupChangeRequests.id, requestId))
      .limit(1);
    const req = rows[0];
    if (!req) throw new NotFoundError("Antrag nicht gefunden.");
    if (req.status !== "pending") {
      throw new ConflictError("Über diesen Antrag wurde bereits entschieden.");
    }

    const toGroupId = req.toGroupId;
    // Exits are written already-approved and never reach this path.
    if (toGroupId === null) throw new ConflictError("Austritte werden nicht freigegeben.");

    const hasLocalBoard = await groupHasActiveLocalBoard(tx, toGroupId);
    if (!canDecideJoinRequest(actor.grants, toGroupId, hasLocalBoard)) {
      throw new ForbiddenError("Über den Wechsel entscheidet der Vorstand der Zielgruppe.");
    }

    const now = new Date();
    const [updated] = await tx
      .update(memberGroupChangeRequests)
      .set({ status: decision, decidedAt: now, decidedBy: actor.userId })
      .where(
        and(
          eq(memberGroupChangeRequests.id, requestId),
          eq(memberGroupChangeRequests.status, "pending"),
        ),
      )
      .returning();
    if (!updated) throw new ConflictError("Über diesen Antrag wurde bereits entschieden.");

    if (decision === "approved") {
      await tx
        .update(members)
        .set({ primaryGroupId: toGroupId, updatedAt: now })
        .where(eq(members.id, req.memberId));
      if (req.fromGroupId !== null) {
        await revokeGroupScopedGrants(tx, req.memberId, req.fromGroupId, actor.userId);
      }
    }

    const event: GroupChangeDecided = {
      type: "members.group_change.decided",
      requestId,
      memberId: req.memberId,
      fromGroupId: req.fromGroupId,
      toGroupId,
      decision,
      actorUserId: actor.userId,
      at: now,
    };
    await getEventBus().publish(event);

    return row2request(updated);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bdas/members test -- group-change`
Expected: PASS — all suites including the 7 new `decideGroupChange` tests.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm --filter @bdas/members typecheck && pnpm lint`

```bash
git add modules/members/src/services/group-change.ts modules/members/src/group-change.test.ts
git commit -m "feat(members): decideGroupChange — destination board approves, auto-revokes origin grants"
```

---

## Task 4: Read services + public surface

**Files:**
- Modify: `modules/members/src/services/group-change.ts`
- Modify: `modules/members/src/index.ts`
- Test: `modules/members/src/group-change.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces (all re-exported from `index.ts`):
  - `getOpenGroupChange(db: Db, memberId: string): Promise<GroupChangeRequest | null>`
  - `listOpenGroupChanges(db: Db, actor: Actor): Promise<OpenGroupChange[]>`
  - `getGroupChangeHistory(db: Db, memberId: string, actor: Actor): Promise<GroupChangeRequest[]>`
  - types `GroupChangeRequest`, `GroupChangeStatus`, `GroupChangeResult`, `OpenGroupChange`
  - events `GroupChangeRequested`, `GroupChangeDecided`, `GroupChangeWithdrawn`

- [ ] **Step 1: Write the failing tests**

Append to `modules/members/src/group-change.test.ts`:

```ts
describeIfDb("group change read services", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  const boardOf = (userId: string, groupId: string) => ({
    userId,
    grants: [{ role: "local_board", groupId }] as ReadonlyArray<Grant>,
  });

  async function transferrer(userId: string): Promise<string> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Test",
      lastName: "Person",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, FEDERAL);
    await changePrimaryGroup(t.db, m.id, "grp_b", self(userId));
    return m.id;
  }

  it("getOpenGroupChange returns the member's open request, or null", async () => {
    const id = await transferrer("usr_open");
    const open = await getOpenGroupChange(t.db, id);
    expect(open?.toGroupId).toBe("grp_b");

    await withdrawGroupChange(t.db, id, self("usr_open"));
    expect(await getOpenGroupChange(t.db, id)).toBeNull();
  });

  it("listOpenGroupChanges: destination board sees it and may decide", async () => {
    await transferrer("usr_x");
    const open = await listOpenGroupChanges(t.db, boardOf("usr_b_board", "grp_b"));
    expect(open.length).toBe(1);
    expect(open[0]?.canDecide).toBe(true);
  });

  it("listOpenGroupChanges: origin board sees it but may NOT decide", async () => {
    await transferrer("usr_y");
    const open = await listOpenGroupChanges(t.db, boardOf("usr_a_board", "grp_a"));
    expect(open.length).toBe(1);
    expect(open[0]?.canDecide).toBe(false);
  });

  it("listOpenGroupChanges: an unrelated board sees nothing", async () => {
    await transferrer("usr_z");
    await createGroup(t, "grp_c", "koeln");
    const open = await listOpenGroupChanges(t.db, boardOf("usr_c_board", "grp_c"));
    expect(open.length).toBe(0);
  });

  it("listOpenGroupChanges: federal board sees every open request", async () => {
    await transferrer("usr_1");
    await transferrer("usr_2");
    const open = await listOpenGroupChanges(t.db, FEDERAL);
    expect(open.length).toBe(2);
  });

  it("getGroupChangeHistory returns newest first and refuses non-boards", async () => {
    const id = await transferrer("usr_hist");
    await withdrawGroupChange(t.db, id, self("usr_hist"));
    await changePrimaryGroup(t.db, id, "grp_b", self("usr_hist"));

    const history = await getGroupChangeHistory(t.db, id, FEDERAL);
    expect(history.length).toBe(2);
    expect(history[0]?.status).toBe("pending"); // newest first
    expect(history[1]?.status).toBe("withdrawn");

    await expect(getGroupChangeHistory(t.db, id, self("usr_nobody"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("getGroupChangeHistory is visible to the destination board too", async () => {
    const id = await transferrer("usr_dest");
    const history = await getGroupChangeHistory(t.db, id, boardOf("usr_b_board", "grp_b"));
    expect(history.length).toBe(1);
  });
});
```

Add `getOpenGroupChange`, `listOpenGroupChanges`, `getGroupChangeHistory` to the `./services/group-change` import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bdas/members test -- group-change`
Expected: FAIL — the three read services are not exported.

- [ ] **Step 3: Implement the read services**

Append to `modules/members/src/services/group-change.ts` (add `canManageGroup`, `isFederalBoard` to the `../roles` import and `inArray` to the drizzle import):

```ts
/** The member's own open request (used by /account — the member is the caller). */
export async function getOpenGroupChange(
  db: Db,
  memberId: string,
): Promise<GroupChangeRequest | null> {
  const rows = await db
    .select()
    .from(memberGroupChangeRequests)
    .where(
      and(
        eq(memberGroupChangeRequests.memberId, memberId),
        eq(memberGroupChangeRequests.status, "pending"),
      ),
    )
    .limit(1);
  return rows[0] ? row2request(rows[0]) : null;
}

/** The groups a local_board / local_board_lead actor is scoped to. */
function scopedGroupIds(actor: Actor): string[] {
  return actor.grants
    .filter(
      (g): g is { role: "local_board" | "local_board_lead"; groupId: string } =>
        (g.role === "local_board" || g.role === "local_board_lead") && g.groupId !== null,
    )
    .map((g) => g.groupId);
}

/**
 * Open transfer requests the actor can see, each flagged with whether the actor
 * may *decide* it. Federal board sees all. A local board sees requests INTO its
 * group (which it decides) and OUT of its group (which it may only watch — the
 * origin group has no veto, ADR 0022).
 */
export async function listOpenGroupChanges(db: Db, actor: Actor): Promise<OpenGroupChange[]> {
  const federal = isFederalBoard(actor.grants);
  const scoped = scopedGroupIds(actor);
  if (!federal && scoped.length === 0) return [];

  const rows = await db
    .select()
    .from(memberGroupChangeRequests)
    .where(eq(memberGroupChangeRequests.status, "pending"))
    .orderBy(desc(memberGroupChangeRequests.requestedAt));

  const visible = federal
    ? rows
    : rows.filter(
        (r) =>
          (r.toGroupId !== null && scoped.includes(r.toGroupId)) ||
          (r.fromGroupId !== null && scoped.includes(r.fromGroupId)),
      );

  // canDecide needs to know whether each destination group has a board of its own
  // (the federal fallback in ADR 0021). One probe per distinct destination.
  const destinations = [...new Set(visible.map((r) => r.toGroupId).filter((g): g is string => g !== null))];
  const hasBoard = new Map<string, boolean>();
  for (const g of destinations) {
    hasBoard.set(g, await groupHasActiveLocalBoard(db, g));
  }

  return visible.map((r) => ({
    ...row2request(r),
    canDecide:
      r.toGroupId !== null &&
      canDecideJoinRequest(actor.grants, r.toGroupId, hasBoard.get(r.toGroupId) ?? false),
  }));
}

/**
 * One member's full movement history, newest first. Visible to federal board, to
 * a board of the member's current group, and to a board of any group involved in
 * one of their requests (the destination board must see what it decided).
 */
export async function getGroupChangeHistory(
  db: Db,
  memberId: string,
  actor: Actor,
): Promise<GroupChangeRequest[]> {
  const memberRows = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  const member = memberRows[0];
  if (!member) throw new NotFoundError("Mitglied nicht gefunden.");

  const rows = await db
    .select()
    .from(memberGroupChangeRequests)
    .where(eq(memberGroupChangeRequests.memberId, memberId))
    .orderBy(desc(memberGroupChangeRequests.requestedAt));

  const involved = new Set<string>();
  if (member.primaryGroupId !== null) involved.add(member.primaryGroupId);
  for (const r of rows) {
    if (r.fromGroupId !== null) involved.add(r.fromGroupId);
    if (r.toGroupId !== null) involved.add(r.toGroupId);
  }

  const allowed =
    isFederalBoard(actor.grants) ||
    [...involved].some((g) => canManageGroup(actor.grants, g));
  if (!allowed) throw new ForbiddenError("Nur Vorstände dürfen den Gruppenverlauf sehen.");

  return rows.map(row2request);
}
```

Note the `OpenGroupChange` import from `../types`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @bdas/members test -- group-change`
Expected: PASS — all suites, 7 new read-service tests included.

- [ ] **Step 5: Widen the public surface**

In `modules/members/src/index.ts`, add after the `roles` export block:

```ts
export {
  changePrimaryGroup,
  withdrawGroupChange,
  decideGroupChange,
  getOpenGroupChange,
  listOpenGroupChanges,
  getGroupChangeHistory,
} from "./services/group-change";
```

Extend the type exports:

```ts
export type {
  Member,
  MemberStatus,
  PendingMember,
  Grant,
  GroupChangeRequest,
  GroupChangeStatus,
  GroupChangeResult,
  OpenGroupChange,
} from "./types";
export type {
  MembersEvent,
  ProfileCreated,
  ProfileUpdated,
  StatusChanged,
  RoleGranted,
  RoleRevoked,
  GroupChangeRequested,
  GroupChangeDecided,
  GroupChangeWithdrawn,
} from "./events";
```

- [ ] **Step 6: Run the whole module suite and commit**

Run: `pnpm --filter @bdas/members test && pnpm --filter @bdas/members typecheck`
Expected: PASS. (`index.export.test.ts` asserts the module's public surface — if it enumerates exports, add the six new names there.)

```bash
git add modules/members/src/services/group-change.ts modules/members/src/index.ts \
        modules/members/src/group-change.test.ts modules/members/src/index.export.test.ts
git commit -m "feat(members): group change read services + public surface"
```

---

## Task 5: Close the hole — `updateProfile` stops writing `primaryGroupId`

**Files:**
- Modify: `modules/members/src/services/profile.ts`
- Modify: `apps/web/app/account/actions.ts`
- Test: `modules/members/src/index.test.ts`

**Interfaces:**
- Consumes: `changePrimaryGroup`, `withdrawGroupChange` (Tasks 2, 4).
- Produces: `UpdateProfileInput` = `{ firstName?: string; lastName?: string }` — **no `primaryGroupId`**; `saveProfileAction` returns `ProfileFormState` widened with `notice?: string`; new `withdrawGroupChangeAction(): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Write the failing regression test**

Append to the `describeIfDb("members integration", ...)` block in `modules/members/src/index.test.ts`:

```ts
  it("updateProfile cannot move a member between groups (ADR 0022)", async () => {
    await createGroup("grp_a", "aachen");
    await createGroup("grp_b", "berlin");
    await createUser("usr_cem", "cem@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_cem",
      firstName: "Cem",
      lastName: "Colak",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, BOARD);

    const after = await updateProfile(t.db, m.id, {
      firstName: "Cem",
      lastName: "Colak",
      primaryGroupId: "grp_b",
    });

    expect(after.primaryGroupId).toBe("grp_a"); // the smuggled field is ignored
    expect(after.firstName).toBe("Cem");
  });
```

Add `updateProfile` to the existing `./services/profile` import in that file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bdas/members test -- index`
Expected: FAIL — `expected 'grp_b' to be 'grp_a'`. This failure *is* the vulnerability, reproduced.

- [ ] **Step 3: Remove `primaryGroupId` from the update path**

In `modules/members/src/services/profile.ts`:

Replace the `UpdateProfileInput` schema with:

```ts
/**
 * Names only. The primary group is NOT editable here (ADR 0022) — it moves via
 * `changePrimaryGroup` (self-service, files a request) or `decideGroupChange`
 * (the destination board). Zod strips the unknown key, so a smuggled
 * `primaryGroupId` is ignored rather than honoured.
 */
export const UpdateProfileInput = z.object({
  firstName: z.string().min(1).max(120).optional(),
  lastName: z.string().min(1).max(120).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;
```

In `updateProfile`, delete the line:

```ts
  if (v.primaryGroupId !== undefined) set.primaryGroupId = v.primaryGroupId;
```

Update the file's header comment — the sentence "Profiles start as `pending` and stay there until a federal_board user approves them" is stale; replace that paragraph with:

```
 * Profiles start as `pending` and stay there until the group's local board
 * approves them (ADR 0021). The primary group is not editable through this
 * service — see services/group-change.ts (ADR 0022).
```

`createProfile` keeps its `primaryGroupId` — a new profile is `pending` and its group choice is what the board decides on.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bdas/members test`
Expected: PASS. If another existing test asserted that `updateProfile` changes the group, it should now be *deleted* (that behaviour was the bug), not adapted.

- [ ] **Step 5: Rewrite the account action**

Replace the body of `saveProfileAction` and append `withdrawGroupChangeAction` in `apps/web/app/account/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import {
  changePrimaryGroup,
  createProfile,
  getCurrentMember,
  updateProfile,
  withdrawGroupChange,
} from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";

export type ProfileFormState = {
  readonly error?: string;
  readonly notice?: string;
  readonly fields?: Record<string, string>;
};

export async function saveProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  requireFlag("members");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return { error: "Anmeldung erforderlich." };

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const groupId = String(formData.get("primaryGroupId") ?? "").trim();
  const primaryGroupId = groupId === "" ? null : groupId;

  try {
    if (!me.member) {
      await createProfile(db, { userId: me.user.id, firstName, lastName, primaryGroupId });
      revalidatePath("/account");
      return {};
    }

    await updateProfile(db, me.member.id, { firstName, lastName });

    // The group moves only through the transfer path (ADR 0022): a pending
    // member's choice is applied, an active member's becomes a request the
    // destination board decides.
    const actor = { userId: me.user.id, grants: me.grants };
    const res = await changePrimaryGroup(db, me.member.id, primaryGroupId, actor);
    revalidatePath("/account");
    return res.kind === "requested"
      ? { notice: "Dein Wechselantrag wurde eingereicht und wartet auf die Zielgruppe." }
      : {};
  } catch (err) {
    if (isAppError(err)) {
      const fields = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return fields ? { error: err.message, fields } : { error: err.message };
    }
    throw err;
  }
}

/** The member cancels their own open transfer request. */
export async function withdrawGroupChangeAction(): Promise<{ ok: boolean; error?: string }> {
  requireFlag("members");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { ok: false, error: "Anmeldung erforderlich." };

  try {
    await withdrawGroupChange(db, me.member.id, { userId: me.user.id, grants: me.grants });
    revalidatePath("/account");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fehler" };
  }
}
```

Note `changePrimaryGroup` is called unconditionally: when the submitted group equals the current one it is a cheap no-op that also clears any open request ("never mind"), which is exactly the revert affordance the form needs.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter @bdas/members test && pnpm --filter web typecheck && pnpm lint`
Expected: PASS.

```bash
git add modules/members/src/services/profile.ts modules/members/src/index.test.ts \
        apps/web/app/account/actions.ts
git commit -m "fix(members): updateProfile can no longer reassign a member's group (ADR 0022)"
```

---

## Task 6: "Mein Konto" — see the open request, withdraw or change it

**Files:**
- Create: `apps/web/app/account/WithdrawChangeButton.tsx`
- Modify: `apps/web/app/account/page.tsx`
- Modify: `apps/web/app/account/ProfileForm.tsx`

**Interfaces:**
- Consumes: `getOpenGroupChange` (Task 4), `withdrawGroupChangeAction` (Task 5), `ProfileFormState.notice` (Task 5).
- Produces: `ProfileForm` gains a required prop `openChangeGroupName: string | null`.

- [ ] **Step 1: Write the withdraw button**

Create `apps/web/app/account/WithdrawChangeButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { withdrawGroupChangeAction } from "./actions";

export function WithdrawChangeButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await withdrawGroupChangeAction();
            setError(res.ok ? null : (res.error ?? "Fehler"));
          })
        }
        className="self-start rounded-bdas-sm border border-bdas-soft px-3 py-1 text-sm text-bdas-ink-body transition-colors duration-bdas-quick hover:bg-bdas-surface-hover"
      >
        {pending ? "Wird zurückgezogen…" : "Antrag zurückziehen"}
      </button>
      {error ? <span className="text-sm text-bdas-red">{error}</span> : null}
    </span>
  );
}
```

- [ ] **Step 2: Show the pending transfer on the account page**

In `apps/web/app/account/page.tsx`:

Extend the imports:

```ts
import { getCurrentMember, getOpenGroupChange, isFederalBoard } from "@bdas/members";

import { WithdrawChangeButton } from "./WithdrawChangeButton";
```

After `const groups = await listGroups(db, { status: "active" });` add:

```ts
  const openChange = me.member ? await getOpenGroupChange(db, me.member.id) : null;
  const groupName = (id: string | null): string | null =>
    id === null ? null : (groups.find((g) => g.id === id)?.name ?? null);
  const currentGroupName = groupName(me.member?.primaryGroupId ?? null);
  const targetGroupName = groupName(openChange?.toGroupId ?? null);
```

Insert this block directly after the `status === "active"` alert:

```tsx
      {openChange && targetGroupName ? (
        <Alert variant="info" title="Gruppenwechsel beantragt">
          <span className="flex flex-col gap-2">
            <span>
              Du bist Mitglied bei <strong>{currentGroupName ?? "keiner Gruppe"}</strong> und hast
              den Wechsel zu <strong>{targetGroupName}</strong> beantragt (seit{" "}
              {new Date(openChange.requestedAt).toLocaleDateString("de-DE")}). Bis der Vorstand von{" "}
              {targetGroupName} entscheidet, bleibst du Mitglied bei{" "}
              {currentGroupName ?? "keiner Gruppe"}.
            </span>
            <WithdrawChangeButton />
          </span>
        </Alert>
      ) : null}
```

- [ ] **Step 3: Hint in the form**

In `apps/web/app/account/ProfileForm.tsx`, add `openChangeGroupName: string | null` to `ProfileFormProps`, destructure it, and render the notice + hint. The `<select>`'s `defaultValue` stays `data.primaryGroupId` — it shows the group the member is *actually in*, not the one they applied to.

Add below the existing `state.error` alert:

```tsx
      {state.notice ? <Alert variant="info">{state.notice}</Alert> : null}
```

And inside the `Field label="Hochschulgruppe"`, directly after the `</select>`:

```tsx
        {openChangeGroupName ? (
          <p className="mt-1 text-sm text-bdas-ink-muted">
            Ein Wechsel zu {openChangeGroupName} ist beantragt. Eine andere Auswahl ersetzt den
            Antrag; die aktuelle Gruppe erneut zu wählen zieht ihn zurück.
          </p>
        ) : null}
```

Pass it from `page.tsx`:

```tsx
          openChangeGroupName={targetGroupName}
```

- [ ] **Step 4: Verify in the running app**

Run: `pnpm --filter web typecheck && pnpm lint`

Then drive it end-to-end (`pnpm dev`, log in as an active member):
1. `/account` → pick a different group → save. Expect the "Gruppenwechsel beantragt" alert, and the select still showing the *old* group.
2. Reload. Expect the alert to persist (the request is in the DB, the member did not move).
3. Click "Antrag zurückziehen". Expect the alert to disappear.
4. Confirm in psql: `SELECT status, from_group_id, to_group_id FROM member_group_change_requests;` → one `withdrawn` row.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/account/
git commit -m "feat(web): account page shows a pending group change and can withdraw it"
```

---

## Task 7: Board dashboard — the flag, the decision buttons, the timeline

**Files:**
- Create: `apps/web/app/(board)/_components/group-history.ts`
- Create: `apps/web/app/(board)/_components/group-history.test.ts`
- Create: `apps/web/app/(board)/_components/group-change-actions.ts`
- Create: `apps/web/app/(board)/_components/MemberGroupPanel.tsx`
- Modify: `apps/web/app/(board)/_components/MembersTable.tsx`
- Modify: `apps/web/app/(board)/federal/members/page.tsx`
- Modify: `apps/web/app/(board)/gruppe/[slug]/members/page.tsx`

**Interfaces:**
- Consumes: `listOpenGroupChanges`, `getGroupChangeHistory`, `decideGroupChange` (Tasks 3, 4); `OpenGroupChange`, `GroupChangeRequest`, `Member` types.
- Produces:
  - `buildGroupTimeline(member: Member, requests: ReadonlyArray<GroupChangeRequest>): TimelineEntry[]` where `TimelineEntry = { id: string; at: Date; fromGroupId: string | null; toGroupId: string | null; kind: "join" | "pending" | "approved" | "rejected" | "withdrawn" }`
  - `decideGroupChangeAction(requestId: string, decision: "approved" | "rejected", revalidate: string): Promise<{ ok: boolean; error?: string }>`
  - `groupHistoryAction(memberId: string): Promise<{ ok: boolean; error?: string; entries?: GroupChangeRequest[] }>`
  - `MembersTable` gains a required prop `openChanges: OpenGroupChange[]`

- [ ] **Step 1: Write the failing timeline test**

Create `apps/web/app/(board)/_components/group-history.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { GroupChangeRequest, Member } from "@bdas/members";

import { buildGroupTimeline } from "./group-history";

const member: Member = {
  id: "mem_1",
  userId: "usr_1",
  firstName: "Cem",
  lastName: "Colak",
  primaryGroupId: "grp_koeln",
  status: "active",
  joinedAt: new Date("2025-05-18T00:00:00Z"),
  createdAt: new Date("2025-05-01T00:00:00Z"),
  updatedAt: new Date("2026-07-10T00:00:00Z"),
};

const req = (over: Partial<GroupChangeRequest>): GroupChangeRequest => ({
  id: "mgc_x",
  memberId: "mem_1",
  fromGroupId: null,
  toGroupId: null,
  status: "approved",
  requestedAt: new Date("2026-01-01T00:00:00Z"),
  decidedAt: new Date("2026-01-02T00:00:00Z"),
  decidedBy: "usr_board",
  ...over,
});

describe("buildGroupTimeline", () => {
  it("appends the federation join derived from joinedAt, oldest last", () => {
    const entries = buildGroupTimeline(member, [
      req({
        id: "mgc_2",
        fromGroupId: "grp_aachen",
        toGroupId: "grp_koeln",
        status: "pending",
        requestedAt: new Date("2026-07-10T00:00:00Z"),
        decidedAt: null,
        decidedBy: null,
      }),
      req({
        id: "mgc_1",
        fromGroupId: "grp_bonn",
        toGroupId: "grp_aachen",
        requestedAt: new Date("2026-03-02T00:00:00Z"),
      }),
    ]);

    expect(entries.map((e) => e.kind)).toEqual(["pending", "approved", "join"]);
    // The join lands in the oldest request's ORIGIN group, not the current one.
    expect(entries[2]?.toGroupId).toBe("grp_bonn");
    expect(entries[2]?.at).toEqual(member.joinedAt);
  });

  it("falls back to the current group for a member who never moved", () => {
    const entries = buildGroupTimeline(member, []);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("join");
    expect(entries[0]?.toGroupId).toBe("grp_koeln");
  });

  it("emits nothing for a member who never joined and never moved", () => {
    expect(buildGroupTimeline({ ...member, joinedAt: null }, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test -- group-history`
Expected: FAIL — `Cannot find module './group-history'`.

- [ ] **Step 3: Write the timeline builder**

Create `apps/web/app/(board)/_components/group-history.ts`:

```ts
import type { GroupChangeRequest, Member } from "@bdas/members";

export type TimelineEntry = {
  readonly id: string;
  readonly at: Date;
  readonly fromGroupId: string | null;
  readonly toGroupId: string | null;
  readonly kind: "join" | "pending" | "approved" | "rejected" | "withdrawn";
};

/**
 * The member's group story, newest first. `requests` is already newest-first
 * from getGroupChangeHistory. The federation join is not a request row — it is
 * derived from `joinedAt` and lands in whichever group the member was in before
 * their first recorded move.
 */
export function buildGroupTimeline(
  member: Member,
  requests: ReadonlyArray<GroupChangeRequest>,
): TimelineEntry[] {
  const entries: TimelineEntry[] = requests.map((r) => ({
    id: r.id,
    at: r.decidedAt ?? r.requestedAt,
    fromGroupId: r.fromGroupId,
    toGroupId: r.toGroupId,
    kind: r.status,
  }));

  if (member.joinedAt === null) return entries;

  const oldest = requests[requests.length - 1];
  const originalGroup = oldest ? oldest.fromGroupId : member.primaryGroupId;

  entries.push({
    id: `join_${member.id}`,
    at: member.joinedAt,
    fromGroupId: null,
    toGroupId: originalGroup,
    kind: "join",
  });

  return entries;
}
```

A request's `status` *is* its timeline kind — `GroupChangeStatus` is a subset of `TimelineEntry["kind"]`, which adds only `"join"` (the one entry with no request row behind it), so the assignment needs no cast.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web test -- group-history`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the board Server Actions**

Create `apps/web/app/(board)/_components/group-change-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import {
  decideGroupChange,
  getCurrentMember,
  getGroupChangeHistory,
  type GroupChangeRequest,
} from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

async function actor() {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) throw new Error("Nicht angemeldet.");
  return { userId: me.user.id, grants: me.grants };
}

/** Server Actions are public endpoints; only ever revalidate board routes. */
function safeRevalidate(path: string): void {
  if (path.startsWith("/federal/") || path.startsWith("/gruppe/")) revalidatePath(path);
}

/** Approve or reject a transfer. Authority is enforced inside decideGroupChange. */
export async function decideGroupChangeAction(
  requestId: string,
  decision: "approved" | "rejected",
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await decideGroupChange(getDb(), requestId, decision, await actor());
    safeRevalidate(revalidate);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

/** One member's movement history — loaded lazily when a board opens their card. */
export async function groupHistoryAction(
  memberId: string,
): Promise<{ ok: boolean; error?: string; entries?: GroupChangeRequest[] }> {
  try {
    const entries = await getGroupChangeHistory(getDb(), memberId, await actor());
    return { ok: true, entries };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
```

- [ ] **Step 6: Write the aside panel**

Create `apps/web/app/(board)/_components/MemberGroupPanel.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";

import type { GroupChangeRequest, Member, OpenGroupChange } from "@bdas/members";

import { decideGroupChangeAction, groupHistoryAction } from "./group-change-actions";
import { buildGroupTimeline, type TimelineEntry } from "./group-history";

const KIND_LABEL: Record<TimelineEntry["kind"], string> = {
  join: "Beitritt",
  pending: "beantragt",
  approved: "freigegeben",
  rejected: "abgelehnt",
  withdrawn: "zurückgezogen",
};

const fmt = (d: Date) => new Date(d).toLocaleDateString("de-DE");

/**
 * The transfer block of the member card: the open request (with the decision
 * buttons, if this board may decide) and the collapsed group history. History is
 * fetched on open — the members list itself stays a single query.
 */
export function MemberGroupPanel({
  member,
  open,
  groupNames,
  revalidatePath,
}: {
  member: Member;
  open: OpenGroupChange | null;
  groupNames: Record<string, string>;
  revalidatePath: string;
}) {
  const [history, setHistory] = useState<GroupChangeRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setHistory(null);
    setError(null);
    void groupHistoryAction(member.id).then((res) => {
      if (res.ok && res.entries) setHistory(res.entries);
      else setError(res.error ?? "Verlauf nicht verfügbar.");
    });
  }, [member.id]);

  const name = (id: string | null) => (id === null ? "keine Gruppe" : (groupNames[id] ?? "—"));
  const timeline = history ? buildGroupTimeline(member, history) : [];

  return (
    <div className="mt-4 flex flex-col gap-3">
      {open ? (
        <div className="rounded-bdas-sm border border-bdas-soft bg-bdas-surface-hover p-3">
          <p className="text-sm font-semibold text-bdas-red">Wechsel beantragt</p>
          <p className="mt-1 text-sm text-bdas-ink-body">
            {name(open.fromGroupId)} → {name(open.toGroupId)}
          </p>
          <p className="text-sm text-bdas-ink-muted">seit {fmt(open.requestedAt)}</p>
          {open.canDecide ? (
            <span className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await decideGroupChangeAction(open.id, "approved", revalidatePath);
                    setError(res.ok ? null : (res.error ?? "Fehler"));
                  })
                }
                className="rounded-bdas-sm bg-bdas-red px-2 py-1 text-xs font-semibold text-bdas-surface"
              >
                Freigeben
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await decideGroupChangeAction(open.id, "rejected", revalidatePath);
                    setError(res.ok ? null : (res.error ?? "Fehler"));
                  })
                }
                className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs"
              >
                Ablehnen
              </button>
            </span>
          ) : (
            <p className="mt-2 text-xs text-bdas-ink-muted">
              Entscheidet der Vorstand von {name(open.toGroupId)}.
            </p>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-bdas-red">{error}</p> : null}

      {timeline.length > 0 ? (
        <details className="group rounded-bdas border border-bdas-soft bg-bdas-surface p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-bdas-ink">
            Gruppenverlauf ({timeline.length})
            <span className="text-bdas-red transition-transform duration-bdas-quick group-open:rotate-45">
              +
            </span>
          </summary>
          <ol className="mt-3 flex flex-col gap-2">
            {timeline.map((e) => (
              <li key={e.id} className="border-l-2 border-bdas-soft pl-3 text-sm">
                <p className="text-bdas-ink-body">
                  {e.kind === "join"
                    ? `Beitritt → ${name(e.toGroupId)}`
                    : `${name(e.fromGroupId)} → ${name(e.toGroupId)}`}
                </p>
                <p className="text-xs text-bdas-ink-muted">
                  {fmt(e.at)} · {KIND_LABEL[e.kind]}
                </p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: Wire the table**

In `apps/web/app/(board)/_components/MembersTable.tsx`:

Extend the imports and props:

```tsx
import type { Member, MemberStatus, OpenGroupChange } from "@bdas/members";

import { MemberGroupPanel } from "./MemberGroupPanel";
```

```tsx
export function MembersTable({
  members,
  groupNames,
  openChanges,
  revalidatePath,
}: {
  members: Member[];
  groupNames: Record<string, string>;
  openChanges: OpenGroupChange[];
  revalidatePath: string;
}) {
```

Inside the component, before `return`:

```tsx
  const openByMember = useMemo(
    () => Object.fromEntries(openChanges.map((c) => [c.memberId, c])) as Record<string, OpenGroupChange>,
    [openChanges],
  );
```

In the "Gruppe" cell of each row, append the flag after the group name:

```tsx
                <td className="p-3 text-bdas-ink-body">
                  {m.primaryGroupId ? (groupNames[m.primaryGroupId] ?? "—") : "—"}
                  {openByMember[m.id] ? (
                    <span className="ml-2 rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-red">
                      → {groupNames[openByMember[m.id]!.toGroupId ?? ""] ?? "—"}
                    </span>
                  ) : null}
                </td>
```

In the aside, after the closing `</dl>` and before the "Schließen" button:

```tsx
          <MemberGroupPanel
            member={selected}
            open={openByMember[selected.id] ?? null}
            groupNames={groupNames}
            revalidatePath={revalidatePath}
          />
```

Widen the aside so the timeline is readable: change `className="w-72 shrink-0 …"` to `className="w-80 shrink-0 …"`.

- [ ] **Step 8: Feed the pages**

`apps/web/app/(board)/federal/members/page.tsx`:

```tsx
import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { listMembers, listOpenGroupChanges } from "@bdas/members";

import { requireBoardSession } from "../../../_dashboard/session";
import { MembersTable } from "../../_components/MembersTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mitglieder" };

export default async function FederalMembersPage() {
  const db = getDb();
  const me = await requireBoardSession();
  const [members, groups, openChanges] = await Promise.all([
    listMembers(db, {}),
    listGroups(db),
    listOpenGroupChanges(db, { userId: me.user.id, grants: me.grants }),
  ]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Mitglieder</h1>
      <MembersTable
        members={members}
        groupNames={groupNames}
        openChanges={openChanges}
        revalidatePath="/federal/members"
      />
    </section>
  );
}
```

**Before writing this,** open `apps/web/app/_dashboard/session.ts` and use whatever helper it actually exports for a federal-scoped page (the group page uses `requireGroupScope(slug)`, which returns `{ groupId, ... }`). If no federal equivalent exists, get the actor the same way the existing board actions do — `getCurrentMember(getDb(), readSessionCookie())` — rather than inventing a new helper. The route is already board-gated by the `(board)` layout; you only need the actor's grants for `listOpenGroupChanges`.

`apps/web/app/(board)/gruppe/[slug]/members/page.tsx` — the aside must be able to *name* a destination group that is not this group, so load all groups:

```tsx
import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { listMembers, listOpenGroupChanges } from "@bdas/members";

import { requireGroupScope } from "../../../../_dashboard/session";
import { MembersTable } from "../../../_components/MembersTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mitglieder" };

export default async function GroupMembersPage({ params }: { params: { slug: string } }) {
  const scope = await requireGroupScope(params.slug);
  const db = getDb();
  const [members, groups, openChanges] = await Promise.all([
    listMembers(db, { groupId: scope.groupId }),
    listGroups(db),
    listOpenGroupChanges(db, { userId: scope.me.user.id, grants: scope.me.grants }),
  ]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Mitglieder</h1>
      <MembersTable
        members={members}
        groupNames={groupNames}
        openChanges={openChanges}
        revalidatePath={`/gruppe/${params.slug}/members`}
      />
    </section>
  );
}
```

**Adapt `scope.me.user.id` / `scope.me.grants` to whatever `requireGroupScope` actually returns** — read `apps/web/app/_dashboard/session.ts` first. If it returns only `{ groupId }`, fetch the actor with `getCurrentMember(db, readSessionCookie())` as the board actions do.

Note the members list here is scoped to `groupId`, so a member who has *left* for another group drops out of it — their history stays visible from the federal list and from the destination group's list.

- [ ] **Step 9: Verify in the running app**

Run: `pnpm --filter web typecheck && pnpm lint && pnpm --filter web test`

Then, with `pnpm dev` and a member who has an open request (from Task 6):
1. Open `/federal/members` as federal board. Expect the row's Gruppe cell to read `BDAS Aachen → BDAS Köln`.
2. Click the member. Expect the "Wechsel beantragt" block with **Freigeben** / **Ablehnen** (federal sees them only when the destination has no local board — otherwise the "Entscheidet der Vorstand von …" note).
3. Expand "Gruppenverlauf". Expect the pending row and a "Beitritt" row derived from `joinedAt`.
4. As a `local_board` of the destination group, click **Freigeben**. Expect the row's group to become the new one and the flag to disappear.
5. Confirm in psql that the member's origin-group grants (if any) are revoked.

- [ ] **Step 10: Commit**

```bash
git add "apps/web/app/(board)/"
git commit -m "feat(web): board members list shows pending transfers, decisions, and group history"
```

---

## Task 8: Docs, prod migration, and RLS

**Files:**
- Modify: `modules/members/README.md`
- Prod database (`rcfvs…` Supabase project)

- [ ] **Step 1: Document the flow in the module README**

Add a "Group transfers (ADR 0022)" section to `modules/members/README.md` covering: the request lifecycle (`pending` → `approved`/`rejected`/`withdrawn`), who decides (destination board, federal fallback), what approval does to role grants, that `updateProfile` no longer touches `primary_group_id`, and that the table doubles as the audit log.

- [ ] **Step 2: Full local verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm --filter web build`
Expected: all green. The `e2e/` acceptance job is unaffected (it covers events + §23 signup, and signup still lands a `pending` member with a group).

- [ ] **Step 3: Check how RLS is configured on the sibling tables**

Migrations are **not** applied automatically on deploy in this project, and Row-Level Security (RLS — Postgres's per-row access rules) is inconsistent across existing tables. Before applying, inspect prod:

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('members', 'member_role_grants', 'member_group_change_requests');
```

Mirror whatever `members` and `member_role_grants` have. If they have RLS **enabled with policies**, the new table needs an equivalent policy set before it holds real data; if they have it **disabled** (the app reaches Postgres over the service-role/direct connection), leave the new table consistent with them and note it against the open RLS memory item rather than diverging silently.

- [ ] **Step 4: Apply the migration to production**

The Vercel deploy does not run the migration runner. Apply by hand against the prod project, then record it so the runner doesn't re-run it:

```sql
-- 1. the contents of modules/members/migrations/0006_group_change_requests.sql
-- 2. then:
INSERT INTO _bdas_migrations (module, filename)
VALUES ('members', '0006_group_change_requests.sql');
```

Confirm the exact column names of `_bdas_migrations` first (`SELECT * FROM _bdas_migrations ORDER BY 1 DESC LIMIT 3;`) and match the shape of the existing rows.

**Deploy order matters:** apply the migration *before* the code ships, or `/account` and the board members pages will 500 on a missing relation.

- [ ] **Step 5: Commit and open the PR**

```bash
git add modules/members/README.md
git commit -m "docs(members): group transfer flow (ADR 0022)"
git push -u origin worktree-group-transfer-requests
gh pr create --draft --title "fix(members): group changes require destination-board approval (ADR 0022)" --body "..."
```

The PR body must call out that this closes a privilege-escalation path (a member could self-assign into any group and, with the files flag on, read that group's private documents), so the reviewer runs `/security-review` — CLAUDE.md §4 requires it on auth-adjacent PRs.

---

## Self-Review

**Spec coverage:**
- "member sees they are member of one group and applying for another, waiting for approval" → Task 6, Step 2 (the `Gruppenwechsel beantragt` alert names both groups and the deciding board).
- "should be able to revoke it" → Task 6, Step 1 (`WithdrawChangeButton` → `withdrawGroupChangeAction` → `withdrawGroupChange`).
- "or change it again" → Task 2 (`changePrimaryGroup` supersedes an open request; re-picking the current group withdraws it) + Task 6, Step 3 (the hint under the select spells both out).
- "board-wide members list, click a member, see the change of groups" → Task 7 (`MemberGroupPanel` in the aside: pending block + `<details>` history).
- "cheap and clean solution for the log" → the request table *is* the log (ADR 0022, decision 1); no second audit table, and history loads lazily on click so the list stays one query.
- The original vulnerability → Task 5 (test reproduces it, fix removes `primaryGroupId` from `UpdateProfileInput`).

**Known adaptations required at execution time** (flagged inline, not placeholders): the exact helper exported by `apps/web/app/_dashboard/session.ts` for board pages, and whether `index.export.test.ts` enumerates the public surface. Both are one-line reads.

**Type consistency:** `GroupChangeRequest` / `OpenGroupChange` / `GroupChangeResult` / `TimelineEntry` are defined once (Tasks 1 and 7) and used with those exact names in Tasks 2–7. `changePrimaryGroup`, `withdrawGroupChange`, `decideGroupChange`, `getOpenGroupChange`, `listOpenGroupChanges`, `getGroupChangeHistory` keep their signatures from the Interfaces blocks through to the call sites.
