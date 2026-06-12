# Phase 3 PR 1 — Role Delegation (`local_board_lead`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the federal board appoint local board _leads_ (a new scoped grant `local_board_lead`, several per group) who can then grant/revoke `local_board` within their own group — without touching any other module.

**Architecture:** `local_board_lead` is modelled as another value in the existing `member_role_grants` scoped-grant table (ADR 0007), so the scope column, active-unique index, and FK cascade are reused unchanged. The single authorization chokepoint `requireBoard` in `members/services/roles.ts` becomes scope-aware: appointing leads and `federal_board` stay federal-only; granting `local_board` is allowed for federal **or** a lead of that group. No login/JWT change — leads come purely from DB grants via `effectiveGrants`.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL (Docker for integration tests), Vitest.

---

## Background the executor needs

- **Role domain lives in three places that must stay in sync:** the `Role` union in `modules/auth/src/sso.ts`, the `ALL_ROLES` array + `isRole` in `modules/members/src/roles.ts`, and a SQL `CHECK` constraint `member_role_grants_role_check`. All three must learn `local_board_lead`.
- **`role` is a `text` column with a `CHECK`, not a Postgres enum** — widening the domain is a one-line `DROP CONSTRAINT` + `ADD CONSTRAINT` migration (the `0002` migration comment says exactly this).
- **Authorization today:** `requireBoard(actor)` hard-gates grant/revoke to `federal_board`. This is the ONLY thing that changes behaviorally; `canManageGroup`, approvals, files, and events already handle local scope correctly and must NOT be touched.
- **Integration tests** run against a real Postgres and load module migrations in `beforeEach` (see `modules/members/src/index.test.ts:67`). Tests `describe.skip` automatically when no DB is reachable, so `pnpm test` is safe locally; CI provides Postgres.
- **Do NOT touch** `modules/auth/src/services/login.ts` — the login allowlist only ever sets `federal_board`; leads are appointed via the (later) dashboard UI, never at login.

Run all tests from the repo root with: `pnpm --filter @bdas/members test`

---

## Task 1: Widen the role domain (type + runtime list)

**Files:**

- Modify: `modules/auth/src/sso.ts:19`
- Modify: `modules/members/src/roles.ts:5`
- Test: `modules/members/src/index.export.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `it` block inside the existing `describe("members public role primitives", ...)` in `modules/members/src/index.export.test.ts`:

```ts
it("isRole accepts local_board_lead", () => {
  // isRole is re-exported from the module surface.
  expect(isRole("local_board_lead")).toBe(true);
  expect(isRole("not_a_role")).toBe(false);
});
```

And add `isRole` to the import at the top of that file:

```ts
import { canGrantLocalBoard, canManageGroup, isFederalBoard, isRole } from "./index";
```

(`canGrantLocalBoard` is imported now so the file compiles once Task 2 adds it; it is exercised in Task 2.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/members test -- index.export`
Expected: FAIL — the file fails to compile because `canGrantLocalBoard` is not exported yet, and `isRole("local_board_lead")` returns `false` (it isn't in `ALL_ROLES` yet).

- [ ] **Step 3: Add `local_board_lead` to the `Role` union**

In `modules/auth/src/sso.ts`, replace line 19:

```ts
export type Role = "member" | "local_board" | "local_board_lead" | "federal_board" | "alumnus";
```

- [ ] **Step 4: Add it to `ALL_ROLES`**

In `modules/members/src/roles.ts`, replace the `ALL_ROLES` constant (line 5):

```ts
const ALL_ROLES: ReadonlyArray<Role> = [
  "member",
  "local_board",
  "local_board_lead",
  "federal_board",
  "alumnus",
];
```

- [ ] **Step 5: Export `canGrantLocalBoard` from the module surface**

In `modules/members/src/index.ts`, the re-export block from `./roles` already lists `isRole`. Add `canGrantLocalBoard` to it so the block reads:

```ts
export {
  canTransition,
  effectiveGrants,
  isRole,
  isFederalBoard,
  canManageGroup,
  canGrantLocalBoard,
  canApproveMember,
} from "./roles";
```

- [ ] **Step 6: Run test to verify it passes (canGrantLocalBoard added in Task 2 — expect a compile error referencing it)**

Run: `pnpm --filter @bdas/members test -- index.export`
Expected: still FAILS to compile because `canGrantLocalBoard` does not exist yet. That is expected — proceed to Task 2, which makes both tests green. Do NOT commit yet.

---

## Task 2: `canGrantLocalBoard` predicate (pure, no DB)

**Files:**

- Modify: `modules/members/src/roles.ts` (add after `canManageGroup`)
- Test: `modules/members/src/index.export.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `modules/members/src/index.export.test.ts` inside the same `describe`:

```ts
it("canGrantLocalBoard: federal anywhere; a lead only its own group", () => {
  const lead: Grant[] = [{ role: "local_board_lead", groupId: "grp_muc" }];
  expect(canGrantLocalBoard(federal, "grp_xyz")).toBe(true); // federal: any group
  expect(canGrantLocalBoard(lead, "grp_muc")).toBe(true); // lead of this group
  expect(canGrantLocalBoard(lead, "grp_other")).toBe(false); // lead, wrong group
  expect(canGrantLocalBoard(lead, null)).toBe(false); // unscoped is never delegable
  expect(canGrantLocalBoard(localMuc, "grp_muc")).toBe(false); // plain local_board ≠ lead
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/members test -- index.export`
Expected: FAIL — `canGrantLocalBoard` is not defined.

- [ ] **Step 3: Implement the predicate**

In `modules/members/src/roles.ts`, add immediately after the `canManageGroup` function:

```ts
/**
 * May the actor grant/revoke `local_board` for this group (ADR 0013)? Federal
 * board → any group. A `local_board_lead` → only the group its lead grant is
 * scoped to. A null groupId is never delegable — only federal (handled above).
 * Note: a plain `local_board` grant does NOT confer this; only a lead does.
 */
export function canGrantLocalBoard(grants: ReadonlyArray<Grant>, groupId: string | null): boolean {
  if (isFederalBoard(grants)) return true;
  if (groupId === null) return false;
  return grants.some((g) => g.role === "local_board_lead" && g.groupId === groupId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/members test -- index.export`
Expected: PASS — all three role-primitive tests (incl. Task 1's `isRole` test) green.

- [ ] **Step 5: Commit**

```bash
git add modules/auth/src/sso.ts modules/members/src/roles.ts modules/members/src/index.ts modules/members/src/index.export.test.ts
git commit -m "feat(members): add local_board_lead role + canGrantLocalBoard predicate"
```

---

## Task 3: Migration — widen the role CHECK; verify a lead can be appointed

**Files:**

- Create: `modules/members/migrations/0003_local_board_lead.sql`
- Modify: `modules/members/src/index.test.ts:67-72` (migration load list)
- Test: `modules/members/src/index.test.ts` (new `it` block)

- [ ] **Step 1: Write the failing test**

In `modules/members/src/index.test.ts`, add this `it` block immediately after the existing `grantRole/revokeRole: federal-only, scoped, idempotent, immediate` test (around line 245):

```ts
it("federal board may appoint a local_board_lead (migration 0003)", async () => {
  await createGroup("grp_a", "aachen");
  await createUser("usr_lead", "lead@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_lead",
    firstName: "L",
    lastName: "x",
    primaryGroupId: "grp_a",
  });
  await approveMember(t.db, m.id, BOARD);

  // local_board_lead is group-scoped, like local_board.
  await expect(grantRole(t.db, m.id, "local_board_lead", BOARD)).rejects.toMatchObject({
    code: "VALIDATION",
  });

  await grantRole(t.db, m.id, "local_board_lead", BOARD, "grp_a");
  expect(await getGrants(t.db, m.id)).toContainEqual({
    role: "local_board_lead",
    groupId: "grp_a",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/members test -- index.test`
Expected: FAIL — either a `VALIDATION` error is NOT thrown for the unscoped case (because `requireValidScope` doesn't yet treat `local_board_lead` as group-scoped), or the scoped insert violates `member_role_grants_role_check`. Both are fixed below.

- [ ] **Step 3: Create the migration**

Create `modules/members/migrations/0003_local_board_lead.sql`:

```sql
-- Members module — local board delegation (ADR 0013).
--
-- Federal board appoints `local_board_lead` (group-scoped, several per group);
-- a lead may then grant/revoke `local_board` within its own group. Modelled as
-- another scoped-grant value so the existing member_role_grants machinery
-- (scope column, active-unique index, FK cascade) is reused unchanged. Only the
-- role CHECK domain widens — the one-line drop+recreate 0002 anticipated.
ALTER TABLE member_role_grants
  DROP CONSTRAINT member_role_grants_role_check;

ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board', 'local_board_lead', 'federal_board', 'alumnus'));
```

- [ ] **Step 4: Wire the migration into the integration-test load list**

In `modules/members/src/index.test.ts`, extend the array in `beforeEach` (currently ending at `0002_role_grants.sql`) so it reads:

```ts
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "migrations", "0001_init.sql"],
      ["..", "migrations", "0002_role_grants.sql"],
      ["..", "migrations", "0003_local_board_lead.sql"],
    ]) {
```

- [ ] **Step 5: Teach `requireValidScope` that `local_board_lead` is group-scoped**

In `modules/members/src/services/roles.ts`, replace the `requireValidScope` function:

```ts
/** local_board and local_board_lead are group-scoped; federal_board is unscoped. */
function requireValidScope(role: Role, groupId: string | null): void {
  if ((role === "local_board" || role === "local_board_lead") && groupId === null) {
    throw new ValidationError(`${role} erfordert eine Gruppe.`);
  }
  if (role === "federal_board" && groupId !== null) {
    throw new ValidationError("federal_board ist nicht gruppengebunden.");
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @bdas/members test -- index.test`
Expected: PASS — the appoint-a-lead test is green (appointing still uses the existing federal-only `requireBoard`, which `BOARD` satisfies). The pre-existing `grantRole/revokeRole` test stays green (PEASANT is still forbidden).

- [ ] **Step 7: Commit**

```bash
git add modules/members/migrations/0003_local_board_lead.sql modules/members/src/index.test.ts modules/members/src/services/roles.ts
git commit -m "feat(members): migration + scope validation for local_board_lead"
```

---

## Task 4: Scope-aware grant authorization (delegation behavior)

**Files:**

- Modify: `modules/members/src/services/roles.ts` (replace `requireBoard`; update `grantRole`/`revokeRole` call order)
- Test: `modules/members/src/index.test.ts` (new `it` block)

- [ ] **Step 1: Write the failing test**

In `modules/members/src/index.test.ts`, add after the Task 3 test:

```ts
it("a local_board_lead grants local_board within its group, but not across groups or higher roles", async () => {
  await createGroup("grp_a", "aachen");
  await createGroup("grp_b", "bonn");
  await createUser("usr_lead", "lead2@example.de");
  const lead = await createProfile(t.db, {
    userId: "usr_lead",
    firstName: "Lead",
    lastName: "x",
    primaryGroupId: "grp_a",
  });
  await approveMember(t.db, lead.id, BOARD);
  await grantRole(t.db, lead.id, "local_board_lead", BOARD, "grp_a");
  const leadActor = { userId: "usr_lead", grants: await getGrants(t.db, lead.id) };

  // A member of grp_a to be promoted by the lead.
  await createUser("usr_member", "member@example.de");
  const member = await createProfile(t.db, {
    userId: "usr_member",
    firstName: "Mem",
    lastName: "x",
    primaryGroupId: "grp_a",
  });
  await approveMember(t.db, member.id, BOARD);

  // Lead CAN grant local_board within its own group...
  await grantRole(t.db, member.id, "local_board", leadActor, "grp_a");
  expect(await getGrants(t.db, member.id)).toContainEqual({
    role: "local_board",
    groupId: "grp_a",
  });

  // ...and CAN revoke it again.
  await revokeRole(t.db, member.id, "local_board", leadActor, "grp_a");
  expect(await getGrants(t.db, member.id)).not.toContainEqual({
    role: "local_board",
    groupId: "grp_a",
  });

  // Lead CANNOT grant local_board in another group.
  await expect(grantRole(t.db, member.id, "local_board", leadActor, "grp_b")).rejects.toMatchObject(
    { code: "FORBIDDEN" },
  );

  // Lead CANNOT appoint another lead, nor grant federal_board.
  await expect(
    grantRole(t.db, member.id, "local_board_lead", leadActor, "grp_a"),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(grantRole(t.db, member.id, "federal_board", leadActor)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/members test -- index.test`
Expected: FAIL — `requireBoard` rejects the lead (`FORBIDDEN`) even for granting `local_board` in its own group, so the first `grantRole(..., leadActor, "grp_a")` throws.

- [ ] **Step 3: Replace `requireBoard` with scope-aware `requireCanGrant`**

In `modules/members/src/services/roles.ts`:

(a) Update the import from `../roles` to include `canGrantLocalBoard`:

```ts
import { canGrantLocalBoard, isFederalBoard, isRole } from "../roles";
```

(b) Replace the `requireBoard` function with:

```ts
/**
 * Who may grant/revoke (ADR 0013, supersedes the federal-only rule):
 *  - `local_board`              → federal_board OR a local_board_lead of that group
 *  - everything else            → federal_board only
 *    (appointing leads and federal_board stays central; member/alumnus are
 *     edge grants the federation owns).
 * `role` must already be validated to a known Role and `groupId` to its scope.
 */
function requireCanGrant(actor: Actor, role: Role, groupId: string | null): void {
  if (role === "local_board") {
    if (canGrantLocalBoard(actor.grants, groupId)) return;
    throw new ForbiddenError(
      "Nur der Bundesvorstand oder ein Vorstands-Lead dieser Gruppe darf local_board vergeben.",
    );
  }
  if (!isFederalBoard(actor.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand darf diese Rolle vergeben.");
  }
}
```

(c) In `grantRole`, replace the opening three guard lines:

```ts
requireBoard(actor);
requireValidRole(role);
requireValidScope(role, groupId);
```

with (validate role/scope first so `requireCanGrant` receives a typed `Role` and a checked scope):

```ts
requireValidRole(role);
requireValidScope(role, groupId);
requireCanGrant(actor, role, groupId);
```

(d) In `revokeRole`, replace its two opening guard lines:

```ts
requireBoard(actor);
requireValidRole(role);
```

with:

```ts
requireValidRole(role);
requireCanGrant(actor, role, groupId);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/members test -- index.test`
Expected: PASS — the delegation test is green; the pre-existing `grantRole/revokeRole: federal-only…` test still passes (PEASANT has neither federal nor a lead grant → `FORBIDDEN`; validation and idempotency unchanged).

- [ ] **Step 5: Run the full members suite + typecheck**

Run: `pnpm --filter @bdas/members test && pnpm --filter @bdas/members typecheck`
Expected: PASS — no dangling reference to the removed `requireBoard`.

- [ ] **Step 6: Commit**

```bash
git add modules/members/src/services/roles.ts modules/members/src/index.test.ts
git commit -m "feat(members): leads may grant local_board within their group"
```

---

## Task 5: Record the decision (ADR) and refresh stale comments

**Files:**

- Create: `docs/decisions/0013-local-board-delegation.md`
- Modify: `modules/members/src/services/roles.ts` (file header comment)
- Modify: `modules/members/README.md` (roles section, if present)

- [ ] **Step 1: Write the ADR**

Create `docs/decisions/0013-local-board-delegation.md`:

```markdown
# ADR 0013 — Local board delegation (`local_board_lead`)

- **Status:** Accepted
- **Date:** 2026-06-11
- **Amends:** ADR 0007 — the clause "every grant hard-gates to `federal_board`".

## Context

ADR 0007 made `federal_board` the sole authority for every role grant. In
practice the federation wants local boards to manage their own membership: the
federal board should appoint one or more trusted members of a local board, who
then add/remove `local_board` within that group. Centralising every local board
change on the federal board does not match how the groups operate.

## Decision

Introduce a new group-scoped grant **`local_board_lead`**, stored as another
value in `member_role_grants` (no new table; the scope column, active-unique
index, and FK cascade are reused).

- Federal board appoints/revokes `local_board_lead` for a group. **Several
  co-leads per group are allowed** (no uniqueness constraint).
- A `local_board_lead` may grant/revoke **`local_board` for its own group only**.
- A lead may NOT appoint other leads, grant `federal_board`, or act on another
  group. Federal board remains a superset and may grant any role directly.

Authorization lives in one chokepoint, `requireCanGrant` in
`modules/members/src/services/roles.ts`. The role domain widens in three places
kept in sync: the `Role` union (`auth`), `ALL_ROLES`/`isRole` (`members`), and
the `member_role_grants_role_check` constraint (migration `0003`).

Leads are never set at login — the JWT allowlist still only grants
`federal_board`; lead authority flows from DB grants via `effectiveGrants`.

## Consequences

- Local boards self-manage their roster; the federal board controls only who the
  leads are. Existing grants are unaffected (the change is additive; no backfill).
- A new highest-trust appointment (`local_board_lead`) exists. The dashboard
  roles surfaces (`/federal/roles`, `/gruppe/[slug]/vorstand`) gate on it and get
  `/security-review` per CLAUDE.md §4.
- Reverses ADR 0007's "federal-only grant" rule; that ADR's table model stands.
```

- [ ] **Step 2: Fix the now-inaccurate file header**

In `modules/members/src/services/roles.ts`, replace the opening doc comment (lines 1-6) so it no longer claims federal-only:

```ts
/**
 * Role grant / revoke (ADR 0007, amended by ADR 0013). Writes scoped rows to
 * `member_role_grants`. Federal board may grant any role; a `local_board_lead`
 * may grant/revoke `local_board` within its own group only (see requireCanGrant).
 * `local_board` and `local_board_lead` are group-scoped; `federal_board` is unscoped.
 */
```

- [ ] **Step 3: Update the module README if it documents the grant authority**

Open `modules/members/README.md`. If it states that only the federal board may grant roles, add a line:

```markdown
- `local_board_lead` (ADR 0013): federal board appoints leads per group (several
  allowed); a lead grants/revokes `local_board` within its own group only.
```

If the README has no roles/authority section, skip this step (no placeholder edits).

- [ ] **Step 4: Verify nothing references the removed symbol**

Run: `grep -rn "requireBoard" modules/ apps/`
Expected: no matches (the function was renamed to `requireCanGrant` and is module-private).

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/0013-local-board-delegation.md modules/members/src/services/roles.ts modules/members/README.md
git commit -m "docs(adr-0013): record local board delegation; refresh stale comments"
```

---

## Task 6: Full-repo guard rails

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + lint the whole repo**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS — the widened `Role` union resolves everywhere (exhaustive `switch`es over `Role`, if any, must already handle a `default`; if the compiler flags a non-exhaustive switch on `Role`, add the missing `local_board_lead` arm at the flagged location and re-run).

- [ ] **Step 2: Run the members integration suite once more**

Run: `pnpm --filter @bdas/members test`
Expected: PASS (or `skip` if no local Postgres — in that case rely on CI).

- [ ] **Step 3: Confirm migration dry-run still parses the new file**

Run: `pnpm db:migrate:dry`
Expected: the runner lists `members/0003_local_board_lead.sql` in order after `0002_role_grants.sql` with no error.

---

## Self-review notes (already reconciled)

- **Spec coverage:** implements §5 "Role delegation model" and the §5 blast-radius table rows 1–6 of `docs/superpowers/specs/2026-06-11-phase3-dashboard-design.md`. UI surfaces (`/federal/roles`, `/vorstand`) are explicitly later PRs and out of this plan.
- **Type consistency:** `canGrantLocalBoard(grants, groupId)`, `requireCanGrant(actor, role, groupId)`, `requireValidScope(role, groupId)` are used with identical signatures across tasks.
- **No login change:** Task background and the ADR both state leads never come from the JWT allowlist.

```

```
