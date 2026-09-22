# Local Role Redesign — PR1: Migration + Lead consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `local_board` into `local_board_lead` ("Lead") everywhere — DB data, `member_role_grants` CHECK domain, `Role` union, every predicate and query that branches on the two roles — and widen the CHECK domain to admit the two brand-new role values (`file_manager`, `blogger`) that PR2/PR3 will start using. After this PR, `local_board` no longer exists anywhere in the system.

**Architecture:** `local_board_lead` is already a strict superset of `local_board` in every predicate (`modules/members/src/roles.ts`) — `canManageGroup`, `canDecideJoinRequest`, `boardGroupIds`, `canAdministerBoard`, and `boardScopes` all already treat the two identically. Collapsing is therefore mostly deletion: drop the `local_board` branch from each `.some(...)`, backfill the data with a dedup-safe migration (hard cutover — pre-production, per the accepted risk), and update every call site, test fixture, and grant-UI option that still names `local_board`.

**Tech Stack:** PostgreSQL (raw SQL migration), Drizzle, TypeScript, Vitest (unit + Docker-Postgres integration).

**Spec:** This session's role-redesign analysis (chat) — no separate design doc; ADR 0013 (`docs/decisions/0013-local-board-delegation.md`) and ADR 0007 (`docs/decisions/0007-scoped-role-grants.md`) are the prior decisions being amended in effect (not superseded — the scoped-grant model and lead-delegation mechanism are unchanged, only the `local_board` value disappears).

## Global Constraints

- **CLAUDE.md §1 rule 1:** only `modules/members` touches `member_role_grants`.
- **CLAUDE.md §1 rule 7:** migration lives in `modules/members/migrations/`, next sequential file is `0010_local_role_redesign.sql`.
- **CLAUDE.md §4:** tests ship in this PR, not a follow-up; this PR changes authorization, so it needs `/security-review` before merge.
- **Hard cutover accepted (D3):** no expand/contract split — the CHECK constraint drops `local_board` in the same migration that backfills the data. Pre-production, short deploy window is acceptable.
- **Historical audit rows are rewritten too (D4):** the backfill renames _every_ `local_board` row, active or revoked — the audit log shows "Lead" retroactively, not "Vorstand (jetzt Lead)".
- Do not touch `event_organizer`'s or `page_editor`'s behavior in this PR — only `local_board` disappears here. `file_manager`/`blogger` get added to the CHECK domain now (so PR2/PR3 don't need their own migration) but are not yet grantable from any UI or used by any predicate until PR2/PR3 land.
- Do not touch the FAQ (`apps/web/content/faq/vorstand.ts`) or the Datei-Bereich labels — both explicitly out of scope, owned elsewhere.

---

### Task 1: Migration — backfill `local_board` → `local_board_lead`, widen CHECK for the two new roles

**Files:**

- Create: `modules/members/migrations/0010_local_role_redesign.sql`
- Test: `modules/members/src/local-role-redesign.integration.test.ts`

**Interfaces:**

- Consumes: existing `member_role_grants` table (`modules/members/src/schema.ts`), existing `member_role_grants_role_check` constraint (last widened in `modules/members/migrations/0007_page_editor.sql`).
- Produces: `member_role_grants.role` domain is now `('member', 'local_board_lead', 'federal_board', 'alumnus', 'event_organizer', 'page_editor', 'file_manager', 'blogger')` — `local_board` is gone. Every previously-active or previously-revoked `local_board` row now reads `local_board_lead`.

This is a data migration, not a pure function — TDD here means: write the integration test against a real (Docker) Postgres first, watch it fail against the _old_ schema/data, then add the migration file and watch it pass. `pnpm db:up` must be running (see `modules/members/README.md` / repo root `README.md` for the Docker Postgres compose target used by module integration tests).

- [ ] **Step 1: Write the failing integration test**

```typescript
// modules/members/src/local-role-redesign.integration.test.ts
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createId } from "@bdas/id";

import { memberRoleGrants, members } from "./schema";
import { closeTestDb, getTestDb, resetTestSchema } from "./test-db";

describe("0010_local_role_redesign backfill", () => {
  const db = getTestDb();

  beforeAll(async () => {
    await resetTestSchema(db);
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await db.delete(memberRoleGrants);
    await db.delete(members);
  });

  async function seedMember(id: string): Promise<void> {
    await db.insert(members).values({
      id,
      userId: `usr_${id}`,
      firstName: "T",
      lastName: "M",
      primaryGroupId: null,
      status: "active",
    });
  }

  it("renames a lone active local_board grant to local_board_lead", async () => {
    await seedMember("mem_a");
    await db.insert(memberRoleGrants).values({
      id: createId("mrg"),
      memberId: "mem_a",
      role: "local_board",
      groupId: "grp_x",
      grantedBy: "usr_seed",
    });

    const rows = await db
      .select()
      .from(memberRoleGrants)
      .where(eq(memberRoleGrants.memberId, "mem_a"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("local_board_lead");
  });

  it("dedups a member holding both local_board and local_board_lead for the same group: exactly one active local_board_lead row remains", async () => {
    await seedMember("mem_b");
    await db.insert(memberRoleGrants).values([
      {
        id: createId("mrg"),
        memberId: "mem_b",
        role: "local_board",
        groupId: "grp_y",
        grantedBy: "usr_seed",
      },
      {
        id: createId("mrg"),
        memberId: "mem_b",
        role: "local_board_lead",
        groupId: "grp_y",
        grantedBy: "usr_seed",
      },
    ]);

    const active = await db
      .select()
      .from(memberRoleGrants)
      .where(
        and(
          eq(memberRoleGrants.memberId, "mem_b"),
          eq(memberRoleGrants.role, "local_board_lead"),
          isNull(memberRoleGrants.revokedAt),
        ),
      );
    expect(active).toHaveLength(1);

    const anyLocalBoard = await db
      .select()
      .from(memberRoleGrants)
      .where(and(eq(memberRoleGrants.memberId, "mem_b"), eq(memberRoleGrants.role, "local_board")));
    expect(anyLocalBoard).toHaveLength(0);
  });

  it("rewrites a revoked (historical) local_board row to local_board_lead too", async () => {
    await seedMember("mem_c");
    await db.insert(memberRoleGrants).values({
      id: createId("mrg"),
      memberId: "mem_c",
      role: "local_board",
      groupId: "grp_z",
      grantedBy: "usr_seed",
      revokedAt: new Date(),
      revokedBy: "usr_seed",
    });

    const rows = await db
      .select()
      .from(memberRoleGrants)
      .where(eq(memberRoleGrants.memberId, "mem_c"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("local_board_lead");
    expect(rows[0]?.revokedAt).not.toBeNull();
  });

  it("rejects local_board as a role going forward (CHECK constraint)", async () => {
    await seedMember("mem_d");
    await expect(
      db.insert(memberRoleGrants).values({
        id: createId("mrg"),
        memberId: "mem_d",
        role: "local_board",
        groupId: "grp_w",
        grantedBy: "usr_seed",
      }),
    ).rejects.toThrow();
  });

  it("accepts file_manager and blogger as roles (CHECK domain widened)", async () => {
    await seedMember("mem_e");
    await db.insert(memberRoleGrants).values([
      {
        id: createId("mrg"),
        memberId: "mem_e",
        role: "file_manager",
        groupId: "grp_v",
        grantedBy: "usr_seed",
      },
      {
        id: createId("mrg"),
        memberId: "mem_e",
        role: "blogger",
        groupId: "grp_v",
        grantedBy: "usr_seed",
      },
    ]);

    const rows = await db
      .select()
      .from(memberRoleGrants)
      .where(eq(memberRoleGrants.memberId, "mem_e"));
    expect(rows.map((r) => r.role).sort()).toEqual(["blogger", "file_manager"]);
  });
});
```

Check `modules/members/src/test-db.ts` for the exact exported helper names (`getTestDb`/`resetTestSchema`/`closeTestDb` above are illustrative of the pattern used by this module's other integration tests, e.g. `pool.test.ts`, `group-change.test.ts` — match whatever that file actually exports; do not invent a different schema-reset mechanism).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm db:up && pnpm --filter @bdas/members test local-role-redesign`
Expected: FAIL — `local_board` is still a legal role (no CHECK rejection), no backfill has run, `file_manager`/`blogger` are rejected by the current CHECK constraint.

- [ ] **Step 3: Write the migration**

```sql
-- modules/members/migrations/0010_local_role_redesign.sql
-- Members module — local role redesign: collapse `local_board` into
-- `local_board_lead` ("Lead"), and widen the grant domain with two new
-- group-scoped delegate roles, `file_manager` and `blogger`.
--
-- `local_board_lead` is already a strict superset of `local_board` in every
-- predicate (modules/members/src/roles.ts) — this migration is therefore a
-- straight data rename, not a rights change for anyone who already held
-- `local_board`. Hard cutover: the site is pre-production, so this ships
-- without an expand/contract split (unlike 0007's additive-only widening).
--
-- Order: widen the CHECK first (so the rename below is legal under the new
-- domain), backfill, then narrow the CHECK to remove `local_board` for good.

ALTER TABLE member_role_grants
  DROP CONSTRAINT member_role_grants_role_check;

ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board', 'local_board_lead', 'federal_board', 'alumnus', 'event_organizer', 'page_editor', 'file_manager', 'blogger'));

-- Step 1: where a member already holds an ACTIVE local_board_lead grant for
-- the same group, the plain local_board grant is now redundant. Revoke it
-- rather than rename it — renaming it too would collide with the partial
-- unique index member_role_grants_active_uq (member_id, role, group_id)
-- WHERE revoked_at IS NULL, since the target row would already exist.
UPDATE member_role_grants lb
SET revoked_at = now(), revoked_by = 'system:0010-local-role-redesign'
WHERE lb.role = 'local_board'
  AND lb.revoked_at IS NULL
  AND EXISTS (
    SELECT 1 FROM member_role_grants lead
    WHERE lead.member_id = lb.member_id
      AND lead.role = 'local_board_lead'
      AND lead.group_id IS NOT DISTINCT FROM lb.group_id
      AND lead.revoked_at IS NULL
  );

-- Step 2: every remaining local_board row — active or already-revoked
-- history — becomes local_board_lead outright. The audit log is rewritten
-- to match rather than layered with a "formerly local_board" annotation
-- (accepted: existing board members keep their rights as Lead).
UPDATE member_role_grants
SET role = 'local_board_lead'
WHERE role = 'local_board';

-- Step 3: local_board no longer exists as a role from this point forward.
ALTER TABLE member_role_grants
  DROP CONSTRAINT member_role_grants_role_check;

ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board_lead', 'federal_board', 'alumnus', 'event_organizer', 'page_editor', 'file_manager', 'blogger'));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bdas/members test local-role-redesign`
Expected: PASS — all 5 cases green.

- [ ] **Step 5: Commit**

```bash
git add modules/members/migrations/0010_local_role_redesign.sql modules/members/src/local-role-redesign.integration.test.ts
git commit -m "feat(members): migrate local_board grants to local_board_lead, add file_manager/blogger to the role domain

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 2: `Role` union — drop `local_board`, add `file_manager`/`blogger`

**Files:**

- Modify: `modules/auth/src/sso.ts`

**Interfaces:**

- Produces: `Role` type used by every module that imports `@bdas/auth`'s `Role` (via `@bdas/members`' `Grant`).

- [ ] **Step 1: Update the union**

In `modules/auth/src/sso.ts:19-26`:

```typescript
export type Role =
  | "member"
  | "local_board_lead"
  | "federal_board"
  | "alumnus"
  | "event_organizer"
  | "page_editor"
  | "file_manager"
  | "blogger";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: this alone will surface every place still narrowing on `"local_board"` (TypeScript's literal-union exhaustiveness) as a build error — that error list is your checklist for Task 3. Do not fix anything yet; just confirm the compiler now objects everywhere the string is used.

- [ ] **Step 3: Commit**

```bash
git add modules/auth/src/sso.ts
git commit -m "feat(auth): drop local_board from the Role union, add file_manager and blogger

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

(This commit will not typecheck clean on its own — that's expected and matches how ADR 0013/0026 rolled out the `Role` union widening across three files kept in sync. Tasks 4-9 fix every remaining site. If your workflow requires a green typecheck per commit, squash Tasks 2-9 into one commit instead — do not skip any of the sub-tasks.)

---

### Task 3: `modules/members/src/roles.ts` — collapse the predicates

**Files:**

- Modify: `modules/members/src/roles.ts`
- Modify: `modules/members/src/roles.unit.test.ts`

**Interfaces:**

- Consumes: `Grant` from `./types` (unchanged shape).
- Produces: `ALL_ROLES`, `isRole`, `canManageGroup`, `canGrantLocalRoles` (renamed from `canGrantLocalBoard`), `canEditGroupPage`, `canDecideJoinRequest` — same signatures as today except the renamed export.

- [ ] **Step 1: Write the failing tests**

Rewrite `modules/members/src/roles.unit.test.ts` in full:

```typescript
import { describe, expect, it } from "vitest";

import type { Grant } from "./types";

import {
  canDecideJoinRequest,
  canEditGroupPage,
  canGrantLocalRoles,
  canManageGroup,
  isRole,
} from "./roles";

const g = (role: string, groupId: string | null): Grant => ({ role, groupId }) as Grant;

describe("isRole", () => {
  it("local_board is no longer a valid role", () => {
    expect(isRole("local_board")).toBe(false);
  });

  it("file_manager and blogger are valid roles", () => {
    expect(isRole("file_manager")).toBe(true);
    expect(isRole("blogger")).toBe(true);
  });
});

describe("canManageGroup", () => {
  it("federal board manages every group", () => {
    expect(canManageGroup([g("federal_board", null)], "grp_a")).toBe(true);
  });

  it("local_board_lead manages its own group only", () => {
    expect(canManageGroup([g("local_board_lead", "grp_a")], "grp_a")).toBe(true);
    expect(canManageGroup([g("local_board_lead", "grp_b")], "grp_a")).toBe(false);
  });

  it("a plain member, file_manager, or blogger does not manage the group", () => {
    expect(canManageGroup([g("member", null)], "grp_a")).toBe(false);
    expect(canManageGroup([g("file_manager", "grp_a")], "grp_a")).toBe(false);
    expect(canManageGroup([g("blogger", "grp_a")], "grp_a")).toBe(false);
    expect(canManageGroup([], "grp_a")).toBe(false);
  });

  it("a null groupId is manageable only by federal board", () => {
    expect(canManageGroup([g("federal_board", null)], null)).toBe(true);
    expect(canManageGroup([g("local_board_lead", "grp_a")], null)).toBe(false);
  });
});

describe("canGrantLocalRoles", () => {
  it("federal board grants in any group", () => {
    expect(canGrantLocalRoles([g("federal_board", null)], "grp_a")).toBe(true);
  });

  it("local_board_lead grants only within its own group", () => {
    expect(canGrantLocalRoles([g("local_board_lead", "grp_a")], "grp_a")).toBe(true);
    expect(canGrantLocalRoles([g("local_board_lead", "grp_b")], "grp_a")).toBe(false);
  });

  it("event_organizer, page_editor, file_manager, blogger cannot grant roles themselves", () => {
    expect(canGrantLocalRoles([g("event_organizer", "grp_a")], "grp_a")).toBe(false);
    expect(canGrantLocalRoles([g("page_editor", "grp_a")], "grp_a")).toBe(false);
    expect(canGrantLocalRoles([g("file_manager", "grp_a")], "grp_a")).toBe(false);
    expect(canGrantLocalRoles([g("blogger", "grp_a")], "grp_a")).toBe(false);
  });
});

describe("canEditGroupPage", () => {
  it("federal board edits every group page", () => {
    expect(canEditGroupPage([g("federal_board", null)], "grp_a")).toBe(true);
  });

  it("lead and page_editor edit their own group only", () => {
    expect(canEditGroupPage([g("local_board_lead", "grp_a")], "grp_a")).toBe(true);
    expect(canEditGroupPage([g("page_editor", "grp_a")], "grp_a")).toBe(true);
    expect(canEditGroupPage([g("local_board_lead", "grp_b")], "grp_a")).toBe(false);
    expect(canEditGroupPage([g("page_editor", "grp_b")], "grp_a")).toBe(false);
  });

  it("file_manager, blogger, and a plain member do not edit the group page", () => {
    expect(canEditGroupPage([g("file_manager", "grp_a")], "grp_a")).toBe(false);
    expect(canEditGroupPage([g("blogger", "grp_a")], "grp_a")).toBe(false);
    expect(canEditGroupPage([g("member", null)], "grp_a")).toBe(false);
    expect(canEditGroupPage([], "grp_a")).toBe(false);
  });
});

describe("canDecideJoinRequest", () => {
  it("local_board_lead of the group decides", () => {
    expect(canDecideJoinRequest([g("local_board_lead", "grp_a")], "grp_a", true)).toBe(true);
  });

  it("federal board is the fallback only when the group has no board seat", () => {
    expect(canDecideJoinRequest([g("federal_board", null)], "grp_a", false)).toBe(true);
    expect(canDecideJoinRequest([g("federal_board", null)], "grp_a", true)).toBe(false);
  });

  it("file_manager and blogger cannot decide join requests", () => {
    expect(canDecideJoinRequest([g("file_manager", "grp_a")], "grp_a", true)).toBe(false);
    expect(canDecideJoinRequest([g("blogger", "grp_a")], "grp_a", true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bdas/members test roles.unit`
Expected: FAIL — `canGrantLocalRoles` doesn't exist yet (still named `canGrantLocalBoard`), `isRole("local_board")` still returns `true`, `isRole("file_manager")` still returns `false`.

- [ ] **Step 3: Rewrite `roles.ts`**

```typescript
// modules/members/src/roles.ts
import type { Role } from "@bdas/auth";

import type { Grant, Member, MemberStatus } from "./types";

const ALL_ROLES: ReadonlyArray<Role> = [
  "member",
  "local_board_lead",
  "federal_board",
  "alumnus",
  "event_organizer",
  "page_editor",
  "file_manager",
  "blogger",
];

export function isRole(value: string): value is Role {
  return (ALL_ROLES as ReadonlyArray<string>).includes(value);
}

/**
 * Effective grants a request acts with (ADR 0007):
 *   - JWT roles (env allowlist at login per ADR 0002) → unscoped grants,
 *   - active rows from `member_role_grants` → their stored scope,
 *   - status-implied: active → member, alumnus → alumnus (unscoped).
 * Deduplicated on (role, groupId).
 */
export function effectiveGrants(
  jwtRoles: ReadonlyArray<Role>,
  member: Member | null,
  dbGrants: ReadonlyArray<Grant>,
): ReadonlyArray<Grant> {
  const out: Grant[] = [];
  const seen = new Set<string>();
  const add = (role: Role, groupId: string | null): void => {
    const key = `${role}:${groupId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ role, groupId });
  };

  for (const r of jwtRoles) add(r, null);
  for (const g of dbGrants) add(g.role, g.groupId);
  if (member) {
    if (member.status === "active") add("member", null);
    if (member.status === "alumnus") add("alumnus", null);
  }
  return out;
}

/** Federal board is always unscoped and authorises every group. */
export function isFederalBoard(grants: ReadonlyArray<Grant>): boolean {
  return grants.some((g) => g.role === "federal_board");
}

/**
 * May the actor manage this group? Federal board → any group. A local Lead
 * (`local_board_lead`) → only the group its grant is scoped to — the local
 * role redesign folded the old plain `local_board` role into Lead, so Lead is
 * now the sole local "manages this group" authority. A null groupId is
 * manageable only by federal board (a member with no primary group).
 */
export function canManageGroup(grants: ReadonlyArray<Grant>, groupId: string | null): boolean {
  if (isFederalBoard(grants)) return true;
  if (groupId === null) return false;
  return grants.some((g) => g.role === "local_board_lead" && g.groupId === groupId);
}

/**
 * May the actor grant/revoke the group's local delegate roles (`event_organizer`,
 * `page_editor`, `file_manager`, `blogger`)? Federal board → any group. A Lead
 * → only its own group. Identical authority to `canManageGroup` — kept as a
 * separate name because the two questions ("can run this group" vs. "can hand
 * out its delegate roles") are conceptually distinct even though every Lead
 * today answers yes to both.
 */
export function canGrantLocalRoles(grants: ReadonlyArray<Grant>, groupId: string | null): boolean {
  return canManageGroup(grants, groupId);
}

/**
 * May the actor edit the group's public content page (ADR 0026)? Federal board
 * → any group. A `local_board_lead` or `page_editor` → only the group its
 * grant is scoped to.
 */
export function canEditGroupPage(grants: ReadonlyArray<Grant>, groupId: string): boolean {
  if (isFederalBoard(grants)) return true;
  return grants.some(
    (g) => (g.role === "local_board_lead" || g.role === "page_editor") && g.groupId === groupId,
  );
}

/**
 * May the actor decide a *pending* member's join for a local group (ADR 0021)?
 * A join decision — accept (→ active) or reject (→ inactive) — belongs to the
 * group's Lead. Federal board is NOT a blanket authority here; it may act only
 * as an emergency fallback when the group has zero active Lead seats. A
 * pending member with no group (groupId null) has no local Lead to speak for
 * it and is routed through `canManageGroup` (federal-only) by the caller
 * instead.
 */
export function canDecideJoinRequest(
  grants: ReadonlyArray<Grant>,
  groupId: string,
  groupHasLocalBoard: boolean,
): boolean {
  const isLead = grants.some((g) => g.role === "local_board_lead" && g.groupId === groupId);
  if (isLead) return true;
  if (!groupHasLocalBoard) return isFederalBoard(grants);
  return false;
}

const TRANSITIONS: Record<MemberStatus, ReadonlySet<MemberStatus>> = {
  pending: new Set(["active", "inactive"]),
  active: new Set(["inactive", "alumnus"]),
  inactive: new Set(["active"]),
  alumnus: new Set(["active"]),
};

export function canTransition(from: MemberStatus, to: MemberStatus): boolean {
  return TRANSITIONS[from].has(to);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @bdas/members test roles.unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/members/src/roles.ts modules/members/src/roles.unit.test.ts
git commit -m "feat(members): collapse local_board into local_board_lead in the role predicates

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 4: `services/roles.ts` — grant/revoke rules

**Files:**

- Modify: `modules/members/src/services/roles.ts`

**Interfaces:**

- Consumes: `canGrantLocalRoles` (renamed, Task 3), `isFederalBoard`, `isRole` from `../roles`.
- Produces: `grantRole`, `revokeRole` — same signatures, updated internal `requireCanGrant`/`requireValidScope`.

There's no dedicated unit test file for `requireCanGrant`/`requireValidScope` today (they're exercised only indirectly through integration tests of `grantRole`/`revokeRole`) — Task 6's integration-style coverage below exercises the new domain. No separate failing-test step here; edit directly and let Task 6's tests plus the module's existing `grantRole`/`revokeRole` integration tests (find them via `pnpm --filter @bdas/members test` — likely colocated as `services/roles.test.ts` or exercised from `index.test.ts`) catch regressions.

- [ ] **Step 1: Update `requireCanGrant` and `requireValidScope`**

In `modules/members/src/services/roles.ts`:

```typescript
import { canGrantLocalRoles, isFederalBoard, isRole } from "../roles";
```

(replaces the `canGrantLocalBoard` import)

```typescript
/**
 * Who may grant/revoke (ADR 0013, extended by ADR 0026 and the local role
 * redesign):
 *  - `event_organizer`, `page_editor`, `file_manager`, `blogger` → federal_board
 *    OR the group's Lead (`local_board_lead`)
 *  - everything else (appointing Leads, federal_board) → federal_board only
 * `role` must already be validated to a known Role and `groupId` to its scope.
 */
function requireCanGrant(actor: Actor, role: Role, groupId: string | null): void {
  if (
    role === "event_organizer" ||
    role === "page_editor" ||
    role === "file_manager" ||
    role === "blogger"
  ) {
    if (canGrantLocalRoles(actor.grants, groupId)) return;
    throw new ForbiddenError(
      "Nur der Bundesvorstand oder der Lead dieser Gruppe darf diese Rolle vergeben.",
    );
  }
  if (!isFederalBoard(actor.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand darf diese Rolle vergeben.");
  }
}

function requireValidRole(role: string): asserts role is Role {
  if (!isRole(role)) {
    throw new ValidationError(`Unbekannte Rolle '${role}'.`);
  }
}

/**
 * `local_board_lead`, `event_organizer`, `page_editor`, `file_manager`, and
 * `blogger` are group-scoped; `federal_board` is unscoped.
 */
function requireValidScope(role: Role, groupId: string | null): void {
  if (
    (role === "local_board_lead" ||
      role === "event_organizer" ||
      role === "page_editor" ||
      role === "file_manager" ||
      role === "blogger") &&
    groupId === null
  ) {
    throw new ValidationError(`${role} erfordert eine Gruppe.`);
  }
  if (role === "federal_board" && groupId !== null) {
    throw new ValidationError("federal_board ist nicht gruppengebunden.");
  }
}
```

Also update the file's top-of-file doc comment (lines 1-8) to describe the new grant matrix instead of the `local_board` one.

- [ ] **Step 2: Run the module's existing grant/revoke tests**

Run: `pnpm --filter @bdas/members test`
Expected: any test still asserting `grantRole(..., "local_board", ...)` succeeds will now fail with `ValidationError: Unbekannte Rolle 'local_board'.` — find these via the failing output and fix them in Task 6 (test-fixture sweep). Do not silence failures here; this step is diagnostic.

- [ ] **Step 3: Commit**

(Bundle with Task 6's fixture sweep if you'd rather have one green commit — see note there. Otherwise commit now with the caveat that some tests are red until Task 6 lands.)

```bash
git add modules/members/src/services/roles.ts
git commit -m "feat(members): update grant/revoke authorization for the local role redesign

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 5: `role-views.ts`, `board-recipients.ts` — roster/audit queries and notification recipients

**Files:**

- Modify: `modules/members/src/services/role-views.ts`
- Modify: `modules/members/src/services/board-recipients.ts`
- Test: `modules/members/src/board-recipients.test.ts` (existing — update fixtures)

**Interfaces:**

- Produces: `ROSTER_ROLES` includes `file_manager`/`blogger`, no longer includes `local_board`. `listBoardRecipientsForGroup` queries only `local_board_lead`.

- [ ] **Step 1: Update `ROSTER_ROLES`**

In `modules/members/src/services/role-views.ts:13-19`:

```typescript
// Roles surfaced in the group roster + audit views. event_organizer is a
// group-scoped events delegate (ADR 0017), relabelled "Event-Manager" in the
// UI. page_editor is a group-scoped page-content delegate (ADR 0026).
// file_manager and blogger are the two newest group-scoped delegates from the
// local role redesign.
const ROSTER_ROLES = [
  "federal_board",
  "local_board_lead",
  "event_organizer",
  "page_editor",
  "file_manager",
  "blogger",
] as const;
```

- [ ] **Step 2: Simplify `listBoardRecipientsForGroup`**

In `modules/members/src/services/board-recipients.ts`, replace the `or(...)` with a single equality (the doc comment above it, "the group's active local board (lead + members)", also needs to drop the "+ members" half — there's only Lead now):

```typescript
/**
 * Member ids that should be notified of a new application in `groupId`:
 * the group's Lead(s). Falls back to the federal board when the group has no
 * Lead (spec §8). Deduplicated.
 */
export async function listBoardRecipientsForGroup(
  db: Db,
  groupId: string | null,
): Promise<string[]> {
  if (groupId) {
    const local = await db
      .select({ memberId: memberRoleGrants.memberId })
      .from(memberRoleGrants)
      .where(
        and(
          eq(memberRoleGrants.groupId, groupId),
          isNull(memberRoleGrants.revokedAt),
          eq(memberRoleGrants.role, "local_board_lead"),
        ),
      );
    const ids = [...new Set(local.map((r) => r.memberId))];
    if (ids.length > 0) return ids;
  }

  const federal = await db
    .select({ memberId: memberRoleGrants.memberId })
    .from(memberRoleGrants)
    .where(and(eq(memberRoleGrants.role, "federal_board"), isNull(memberRoleGrants.revokedAt)));
  return [...new Set(federal.map((r) => r.memberId))];
}
```

The unused `or` import can be dropped from the `drizzle-orm` import line if nothing else in the file uses it.

- [ ] **Step 3: Update `board-recipients.test.ts`**

Read `modules/members/src/board-recipients.test.ts` first — it almost certainly seeds a `local_board` grant to test the "falls back to federal when no board" / "notifies the local board" cases. Change every seeded `role: "local_board"` to `role: "local_board_lead"`, and if a test specifically asserted that a plain `local_board` grant (as distinct from `local_board_lead`) was included, fold it into a single "Lead is notified" case instead.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @bdas/members test board-recipients`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/members/src/services/role-views.ts modules/members/src/services/board-recipients.ts modules/members/src/board-recipients.test.ts
git commit -m "feat(members): update roster/audit and notification-recipient queries for the role redesign

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 6: Sweep remaining `local_board` fixtures in `modules/members`

**Files:**

- Modify: any of `modules/members/src/{group-change.test.ts, pool.test.ts, index.export.test.ts, index.test.ts, application-migration.test.ts, subscribers.test.ts, approval-counts.test.ts}` that seed a `role: "local_board"` grant (confirm exact set via `grep -rn "local_board" modules/members/src --include=*.test.ts` — do not guess the list, verify it before editing).

**Interfaces:**

- No new interfaces — mechanical fixture rename.

- [ ] **Step 1: Find every remaining reference**

Run: `pnpm --filter @bdas/members exec grep -rn "\"local_board\"" src` (or use your editor's search) to get the authoritative list — this plan's earlier analysis found `board-recipients.test.ts` (handled in Task 5) plus likely fixtures in the files listed above, but confirm before editing since exact line numbers shift as this plan's earlier tasks land.

- [ ] **Step 2: Rename each fixture**

For each match, change `role: "local_board"` (or the equivalent grant-literal `{ role: "local_board", groupId: ... }`) to `"local_board_lead"`. Where a test specifically exercises the _distinction_ between `local_board` and `local_board_lead` (e.g. "a plain board member cannot grant roles, only a lead can" — this pattern shows up around `requireCanGrant`/`canGrantLocalRoles` tests), that test case is now obsolete (the distinction no longer exists) — delete it rather than renaming it, and add a one-line comment noting why if the surrounding `describe` block would otherwise look thin.

- [ ] **Step 3: Run the full module test suite**

Run: `pnpm --filter @bdas/members test`
Expected: PASS, including the `grantRole`/`revokeRole` tests exercised in Task 4.

- [ ] **Step 4: Commit**

```bash
git add modules/members/src
git commit -m "test(members): rename remaining local_board fixtures to local_board_lead

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 7: `modules/members/README.md` — update documented predicates

**Files:**

- Modify: `modules/members/README.md`

- [ ] **Step 1: Update the "Scoped role grants" section**

In `modules/members/README.md:74-95`, remove every mention of `local_board` as a role, rename `canGrantLocalBoard` to `canGrantLocalRoles` in the bullet list, and update the grant/revoke paragraph (currently: "`local_board` grants require a `groupId`...") to describe the new domain (`local_board_lead`, `event_organizer`, `page_editor`, `file_manager`, `blogger` all require a `groupId`; only `federal_board` doesn't). Also fix the "Lifecycle" section's step 4 (`grantRole local_board <group>`, federal_board only) — that example role no longer exists; use `grantRole local_board_lead <group>` or drop the inline example.

- [ ] **Step 2: Commit**

```bash
git add modules/members/README.md
git commit -m "docs(members): update README for the local role redesign

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 8: `dashboard-shell` — board-access and scope predicates

**Files:**

- Modify: `modules/dashboard-shell/src/access.ts`
- Modify: `modules/dashboard-shell/src/scope.ts`
- Modify: `modules/dashboard-shell/src/access.test.ts`
- Modify: `modules/dashboard-shell/src/scope.test.ts` (if it seeds `local_board` — check)

**Interfaces:**

- Produces: `canAdministerBoard`, `canSeeGroupScope`, `boardScopes` — same signatures.

- [ ] **Step 1: Update the failing tests first**

In `modules/dashboard-shell/src/access.test.ts`, replace the `localAc` fixture:

```typescript
const localAc: Grant[] = [{ role: "local_board_lead", groupId: "grp_ac" }];
```

(No other change needed in this file — same assertions, same role, just the value.)

- [ ] **Step 2: Run to verify it still passes (this is a same-behavior rename, not a new assertion)**

Run: `pnpm --filter @bdas/dashboard-shell test`
Expected: still PASS with the old code (since `local_board_lead` already satisfied every predicate) — this step confirms the fixture rename alone is a no-op today, which is exactly what should be true before you remove the `local_board` branch in Step 3.

- [ ] **Step 3: Simplify `access.ts`**

```typescript
// modules/dashboard-shell/src/access.ts
import { canManageGroup, isFederalBoard } from "@bdas/members";
import type { Grant } from "@bdas/members";
import type { GroupStatus } from "@bdas/groups";

/** May this user enter the cockpit at all? Federal board or a group's Lead
 *  qualifies; a plain member does not. */
export function canAdministerBoard(grants: ReadonlyArray<Grant>): boolean {
  return grants.some((g) => g.role === "federal_board" || g.role === "local_board_lead");
}

/** The `/federal/*` scope is federal-board only. */
export function canSeeFederalScope(grants: ReadonlyArray<Grant>): boolean {
  return isFederalBoard(grants);
}

/** A `/gruppe/[slug]` scope: federal (superset — incl. archived groups, which it
 *  winds down) or the Lead of that group. A Lead may NOT manage an archived
 *  group; only federal can. `canManageGroup` encodes "federal OR Lead of this
 *  group". */
export function canSeeGroupScope(
  grants: ReadonlyArray<Grant>,
  group: { readonly id: string; readonly status: GroupStatus },
): boolean {
  if (isFederalBoard(grants)) return true;
  if (group.status === "archived") return false;
  return canManageGroup(grants, group.id);
}
```

- [ ] **Step 4: Simplify `scope.ts`**

```typescript
// modules/dashboard-shell/src/scope.ts, in boardScopes:
const wanted = new Set<string>();
if (isFederal) {
  for (const g of groups) if (g.status === "active") wanted.add(g.id);
} else {
  for (const grant of grants) {
    if (grant.role === "local_board_lead" && grant.groupId) {
      wanted.add(grant.groupId);
    }
  }
}
```

Also update the function's doc comment (currently: "`local_board` and `local_board_lead` each yield their own group") to just "Each Lead grant yields its own group."

- [ ] **Step 5: Run all dashboard-shell tests**

Run: `pnpm --filter @bdas/dashboard-shell test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/dashboard-shell/src
git commit -m "feat(dashboard-shell): collapse local_board into local_board_lead in board-access predicates

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 9: `event-viewer.ts` — simplify `boardGroupIds`

**Files:**

- Modify: `apps/web/lib/event-viewer.ts`
- Modify: `apps/web/app/lib/event-viewer.test.ts`

**Interfaces:**

- Produces: `viewerFrom` — same signature, `boardGroupIds` now sourced from `local_board_lead` only.

- [ ] **Step 1: Update the test fixture**

In `apps/web/app/lib/event-viewer.test.ts:40`, change:

```typescript
const board = viewerFrom({
  user: { id: "u" },
  member: { status: "active", primaryGroupId: "grp_a" },
  grants: [{ role: "local_board_lead", groupId: "grp_a" }],
} as never);
```

- [ ] **Step 2: Confirm it still passes unchanged (same reasoning as Task 8 Step 2)**

Run: `pnpm --filter @bdas/web test event-viewer`
Expected: PASS.

- [ ] **Step 3: Simplify `viewerFrom`**

In `apps/web/lib/event-viewer.ts:14-16`:

```typescript
    boardGroupIds: me.grants
      .filter((g) => g.role === "local_board_lead" && g.groupId)
      .map((g) => g.groupId as string),
```

- [ ] **Step 4: Re-run**

Run: `pnpm --filter @bdas/web test event-viewer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/event-viewer.ts apps/web/app/lib/event-viewer.test.ts
git commit -m "feat(web): collapse local_board into local_board_lead in the events viewer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 10: `apps/web/app/_dashboard/session.ts` — rename the call site

**Files:**

- Modify: `apps/web/app/_dashboard/session.ts`

**Interfaces:**

- Consumes: `canGrantLocalRoles` (renamed in Task 3) instead of `canGrantLocalBoard`.

- [ ] **Step 1: Update the import and call**

```typescript
import { canGrantLocalRoles, getCurrentMember, type CurrentMember } from "@bdas/members";
```

```typescript
/** Lead-only gate for /gruppe/[slug]/vorstand: federal or the group's Lead
 *  (canGrantLocalRoles). */
export async function requireLeadScope(
  slug: string,
): Promise<{ me: CurrentMember; groupId: string }> {
  const { me, groupId } = await requireGroupScope(slug);
  if (!canGrantLocalRoles(me.grants, groupId)) redirect(`/gruppe/${slug}/overview`);
  return { me, groupId };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: this was the last `canGrantLocalBoard` call site outside `modules/members` — confirm via `grep -rn "canGrantLocalBoard" apps modules` that it now returns nothing.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/_dashboard/session.ts
git commit -m "refactor(web): rename canGrantLocalBoard call site to canGrantLocalRoles

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 11: Grant-UI — remove `local_board` from the Vorstand page, remove its roster section

**Files:**

- Modify: `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx`
- Modify: `apps/web/app/(board)/_components/RoleRoster.tsx`
- Modify: `apps/web/app/(board)/_components/AuditLog.tsx`
- Modify: `apps/web/app/(board)/federal/roles/page.tsx`

**Interfaces:**

- No new interfaces — UI content changes only.

This PR does **not** yet add `file_manager`/`blogger` grant options (PR2/PR3 do, once those roles have working permission logic behind them) — it only removes `local_board`, leaving `event_organizer` ("Organisator" — PR3 relabels it) and `page_editor` as the two grantable options for the remainder of this PR.

- [ ] **Step 1: Update `RoleRoster.tsx`'s `ROLE_LABEL`**

Remove the `local_board: "Vorstand"` entry (leave the other four untouched — PR3 relabels `event_organizer` and adds `file_manager`/`blogger`, not this PR):

```typescript
const ROLE_LABEL: Record<string, string> = {
  federal_board: "Bundesvorstand",
  local_board_lead: "Lead",
  event_organizer: "Organisator",
  page_editor: "Seiten-Editor",
};
```

- [ ] **Step 2: Update `AuditLog.tsx`'s `ROLE_LABEL`**

This one only ever listed the three federal-page roles — confirm it still doesn't need `local_board` (it didn't list `event_organizer`/`page_editor` either, so nothing to add here, just confirm `local_board: "Vorstand"` isn't present — it wasn't, per the earlier read of this file. No edit needed; this step is a verification only.)

- [ ] **Step 3: Update `vorstand/page.tsx`**

Remove the `local_board` grant option and its roster section:

```tsx
<GrantRoleModal
  title="Vorstand hinzufügen"
  candidates={groupMembers.map((m) => ({
    memberId: m.id,
    name: `${m.firstName} ${m.lastName}`,
  }))}
  roleOptions={[
    { role: "event_organizer", label: "Organisator", groupId },
    { role: "page_editor", label: "Seiten-Editor", groupId },
  ]}
  revalidatePath={revalidate}
/>
```

```tsx
<RoleRoster
  sections={[
    { title: "Leads", holders: ofGroup.filter((h) => h.role === "local_board_lead") },
    {
      title: "Organisatoren",
      holders: ofGroup.filter((h) => h.role === "event_organizer"),
    },
    {
      title: "Seiten-Editoren",
      holders: ofGroup.filter((h) => h.role === "page_editor"),
    },
  ]}
  groupNames={{}}
  revalidatePath={revalidate}
  currentMemberId={me.member?.id ?? null}
  showGroupName={false}
/>
```

- [ ] **Step 4: Update `federal/roles/page.tsx`**

Remove the "Lokale Vorstände" section:

```tsx
<RoleRoster
  sections={[
    { title: "Bundesvorstand", holders: holders.filter((h) => h.role === "federal_board") },
    {
      title: "Lokale Vorstands-Leads",
      holders: holders.filter((h) => h.role === "local_board_lead"),
    },
  ]}
  groupNames={groupNames}
  revalidatePath="/federal/roles"
  currentMemberId={me?.member?.id ?? null}
/>
```

- [ ] **Step 5: Typecheck and build**

Run: `pnpm typecheck && pnpm --filter @bdas/web build`
Expected: no errors. (`GrantRoleModal`'s `RoleOption.role` is typed `string`, so removing an option array entry is not a type error either way — this step is a smoke check, not a type-driven one.)

- [ ] **Step 6: Manual verification**

Run: `pnpm dev`, sign in as a federal board member, open `/federal/roles` — confirm the "Lokale Vorstände" section is gone and "Lokale Vorstands-Leads" still lists existing Leads (including anyone migrated from `local_board` by Task 1's migration). Open `/gruppe/<slug>/vorstand` as that group's Lead — confirm the grant modal no longer offers "Vorstand" and the roster no longer has a "Vorstand" section.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx" apps/web/app/\(board\)/_components/RoleRoster.tsx "apps/web/app/(board)/federal/roles/page.tsx"
git commit -m "feat(web): remove local_board from the grant UI and role rosters

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 12: Repo-wide sweep for any remaining `local_board` reference

**Files:**

- Whatever `grep` turns up outside the files already covered above.

- [ ] **Step 1: Full-repo search**

Run: `pnpm typecheck` (should now be fully green) and separately `grep -rn "\"local_board\"" modules apps --include=*.ts --include=*.tsx` (excluding `*.test.ts` files already handled, and excluding any match that's the _substring_ `local_board_lead` — check carefully, since `local_board` is a substring of `local_board_lead`). Also check `modules/profile/src/authz.test.ts:23` specifically (identified during analysis: `for (const role of ["federal_board", "local_board", "local_board_lead"])`).

- [ ] **Step 2: Fix `modules/profile/src/authz.test.ts`**

Remove `"local_board"` from that array (keep `"federal_board"` and `"local_board_lead"` — read the surrounding test first to confirm it's iterating "every role that should have X behavior" rather than something that needs a different fix).

- [ ] **Step 3: Fix any other remaining hits**

For each remaining hit found in Step 1, apply the same judgment as Task 6: rename to `local_board_lead` if it's a fixture, delete if it specifically tested the now-nonexistent local_board/local_board_lead distinction.

- [ ] **Step 4: Full test suite**

Run: `pnpm test`
Expected: PASS, repo-wide.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: sweep remaining local_board references repo-wide

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 13: `/security-review`

- [ ] **Step 1: Run `/security-review` on the full PR1 diff before opening the PR**, per CLAUDE.md §4 ("`/security-review` on every ... PR" that changes authorization). Pay particular attention to: the migration's dedup logic (Task 1 — a bug there could silently drop a Lead's grant or leave a duplicate active row that later confuses `canManageGroup`), and that `canGrantLocalRoles`/`canManageGroup` (Task 3) grant identical authority on purpose, not by accident.

## Self-Review

- **Spec coverage:** local_board removed from DB (Task 1), Role type (Task 2), all predicates (Task 3), grant/revoke rules (Task 4), roster/audit/notification queries (Task 5), test fixtures (Task 6, 12), README (Task 7), dashboard-shell (Task 8), event-viewer (Task 9), session.ts rename (Task 10), grant UI (Task 11). `file_manager`/`blogger` are in the DB domain and `Role` type ready for PR2/PR3 to build on. ✓
- **Placeholder scan:** none — every task has real code or a concrete grep/manual-check step. ✓
- **Type consistency:** `canGrantLocalRoles` name is used consistently from Task 3 (definition) through Task 4 and Task 10 (call sites). `Role` union (Task 2) matches `ALL_ROLES` (Task 3) and the migration's CHECK domain (Task 1) exactly — all three list the same 8 values in the same PR. ✓
