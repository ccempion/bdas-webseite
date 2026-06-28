# Event Pages — Slice 3: `event_organizer` role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a delegable, **group-scoped** `event_organizer` role — "`local_board` restricted to the events surface" — so a trusted non-board member can run the full lifecycle of a group's events.

**Architecture:** `event_organizer` is a new value in the existing `member_role_grants` table, scoped by the existing `group_id` column (sibling of `local_board`). The events module's `Viewer`/`canManage` learns about the viewer's organizer groups; that single predicate change opens every existing event action and management page to organizers. Grant/revoke happens in the existing group roles admin and reuses the `members.role.granted` / `.revoked` bus events, which `notifications` turns into welcome/removal emails. Spec: `docs/superpowers/specs/2026-06-27-event-pages-slice3-design.md`; ADR 0017.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Components + Server Actions), Drizzle ORM on Postgres, `@bdas/events` core bus, Vitest (integration against real Postgres, skips when `DATABASE_URL` unreachable).

## Global Constraints

- **Module ownership (CLAUDE.md §1):** `members` owns role grants; the app delegates to `members.grantRole`/`revokeRole`, never writing `member_role_grants` directly. `events` owns event tables and exposes `Viewer`/`canManage` via its `index.ts`.
- **Role domain widens in three synced places (ADR 0013 precedent):** the `Role` union (`@bdas/auth`), `ALL_ROLES`/`isRole` (`@bdas/members`), and the `member_role_grants_role_check` constraint (new migration). Keep them in sync.
- **Group-scoped, never set at login (ADR 0017):** the JWT allowlist still attaches only `federal_board`; `event_organizer` flows from DB grants via `effectiveGrants`.
- **Grant/revoke authority:** federal board, or a `local_board_lead` of that group — the existing `canGrantLocalBoard` rule. A plain `local_board` grant does NOT confer it.
- **Cross-module side effects via the bus (rule 2/3):** organizer emails react to `members.role.granted`/`.revoked`; no direct call from members to notifications.
- **Feature flag (rule 6):** the management surfaces already call `requireEventsFlag()`/`isFlagOn("events")`; no new flag.
- **German UI copy**, design tokens only (CLAUDE.md §7) — consume `bdas-*` classes, never inline a hex/radius/shadow.
- **Tests ship in the same PR** (CLAUDE.md §4), integration-tested against real Postgres using the existing harness pattern (skip when `DATABASE_URL` unreachable).
- **`/security-review` is required** (a new authorization role) per CLAUDE.md §4.

---

## File map

- **`modules/auth/`** — `src/sso.ts`: add `event_organizer` to the `Role` union.
- **`modules/members/`** — `src/roles.ts` (`ALL_ROLES`), `src/services/roles.ts` (scope + grant authority), `src/services/role-views.ts` (surface organizers in roster/audit), `migrations/0005_event_organizer.sql` (CHECK domain), `src/index.test.ts` (migration list + tests).
- **`modules/events/`** — `src/services/get.ts` (`Viewer.organizerGroupIds`, `ANON`, `canManage`), `src/services/list.ts` (`listManagedEvents`), `src/services/get.test.ts` (new, pure unit), `src/index.test.ts` (Viewer literals + `listManagedEvents` test).
- **`modules/notifications/`** — `src/subscribers.ts` (`SYSTEM_VIEWER` field in Task 3; role subscription in Task 5), `src/types.ts` (templates + `groupName`), `src/templates.ts` (two cases), `src/services/send.ts` (`groupName` passthrough), `src/templates.test.ts`, `src/index.test.ts` (subscriber routing test).
- **`apps/web/`** — `lib/event-viewer.ts` (`organizerGroupIds`, Task 3), `app/admin/events/page.tsx` + `app/admin/events/neu/page.tsx` (gates), `app/admin/events/actions.ts` (create/update auth), `app/(board)/_components/RoleRoster.tsx` (label), `app/(board)/gruppe/[slug]/vorstand/page.tsx` (grant option + roster section).

---

## Task 1: members — `event_organizer` role domain, scope, and grant authority

**Files:**

- Modify: `modules/auth/src/sso.ts:19`
- Modify: `modules/members/src/roles.ts` (`ALL_ROLES`)
- Modify: `modules/members/src/services/roles.ts` (`requireValidScope`, `requireCanGrant`)
- Create: `modules/members/migrations/0005_event_organizer.sql`
- Modify: `modules/members/src/index.test.ts` (migration list + new tests)

**Interfaces:**

- Consumes: existing `grantRole(db, memberId, role, actor, groupId)` / `revokeRole(...)`, `getGrants(db, memberId)`, `canGrantLocalBoard`.
- Produces: `event_organizer` is a grantable group-scoped role; `members.role.granted`/`.revoked` (already exported from `@bdas/members`) now carry `role: "event_organizer"`.

- [ ] **Step 1: Add `event_organizer` to the auth `Role` union**

In `modules/auth/src/sso.ts` line 19, replace:

```typescript
export type Role = "member" | "local_board" | "local_board_lead" | "federal_board" | "alumnus";
```

with:

```typescript
export type Role =
  | "member"
  | "local_board"
  | "local_board_lead"
  | "federal_board"
  | "alumnus"
  | "event_organizer";
```

- [ ] **Step 2: Add it to the members role allowlist**

In `modules/members/src/roles.ts`, extend `ALL_ROLES`:

```typescript
const ALL_ROLES: ReadonlyArray<Role> = [
  "member",
  "local_board",
  "local_board_lead",
  "federal_board",
  "alumnus",
  "event_organizer",
];
```

- [ ] **Step 3: Write the migration**

Create `modules/members/migrations/0005_event_organizer.sql`:

```sql
-- Members module — add the `event_organizer` role to the grant domain (ADR 0017).
-- Group-scoped like local_board: a per-group events delegate ("local_board
-- restricted to the events surface"). Additive; the CHECK domain widens via the
-- drop+recreate shape established in 0003. No backfill; existing grants unaffected.
ALTER TABLE member_role_grants
  DROP CONSTRAINT member_role_grants_role_check;

ALTER TABLE member_role_grants
  ADD CONSTRAINT member_role_grants_role_check
  CHECK (role IN ('member', 'local_board', 'local_board_lead', 'federal_board', 'alumnus', 'event_organizer'));
```

- [ ] **Step 4: Widen scope + grant-authority validation**

In `modules/members/src/services/roles.ts`, replace `requireValidScope` (lines 51–59):

```typescript
/** local_board, local_board_lead and event_organizer are group-scoped; federal_board is unscoped. */
function requireValidScope(role: Role, groupId: string | null): void {
  if (
    (role === "local_board" || role === "local_board_lead" || role === "event_organizer") &&
    groupId === null
  ) {
    throw new ValidationError(`${role} erfordert eine Gruppe.`);
  }
  if (role === "federal_board" && groupId !== null) {
    throw new ValidationError("federal_board ist nicht gruppengebunden.");
  }
}
```

and replace the `local_board` branch of `requireCanGrant` (lines 33–39) so it also covers `event_organizer` (same federal-or-lead rule, ADR 0017):

```typescript
function requireCanGrant(actor: Actor, role: Role, groupId: string | null): void {
  if (role === "local_board" || role === "event_organizer") {
    if (canGrantLocalBoard(actor.grants, groupId)) return;
    throw new ForbiddenError(
      "Nur der Bundesvorstand oder ein Vorstands-Lead dieser Gruppe darf diese Rolle vergeben.",
    );
  }
  if (!isFederalBoard(actor.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand darf diese Rolle vergeben.");
  }
}
```

- [ ] **Step 5: Add the migration to the test harness + write failing tests**

In `modules/members/src/index.test.ts`, add the new migration to the `beforeEach` file list (after the `0004_revoked_by.sql` entry, around line 81):

```typescript
      ["..", "migrations", "0004_revoked_by.sql"],
      ["..", "migrations", "0005_event_organizer.sql"],
```

Then add these tests (the `createGroup`, `createUser`, `createProfile`, `approveMember`, `grantRole`, `revokeRole`, `getGrants`, `BOARD`, `leadOf`, `localBoardOf` helpers already exist in this file):

```typescript
it("a lead may grant/revoke event_organizer scoped to its group (ADR 0017)", async () => {
  await createGroup("grp_a", "aachen");
  await createUser("usr_org", "org@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_org",
    firstName: "O",
    lastName: "x",
    primaryGroupId: "grp_a",
  });
  await approveMember(t.db, m.id, BOARD);

  // event_organizer is group-scoped: a null scope is rejected.
  await expect(grantRole(t.db, m.id, "event_organizer", BOARD)).rejects.toMatchObject({
    code: "VALIDATION",
  });

  // A lead of the group may grant it.
  await grantRole(t.db, m.id, "event_organizer", leadOf("usr_lead", "grp_a"), "grp_a");
  expect(await getGrants(t.db, m.id)).toContainEqual({
    role: "event_organizer",
    groupId: "grp_a",
  });

  // ...and revoke it.
  await revokeRole(t.db, m.id, "event_organizer", leadOf("usr_lead", "grp_a"), "grp_a");
  expect(await getGrants(t.db, m.id)).not.toContainEqual({
    role: "event_organizer",
    groupId: "grp_a",
  });
});

it("a plain local_board member may NOT grant event_organizer", async () => {
  await createGroup("grp_a", "aachen");
  await createUser("usr_org2", "org2@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_org2",
    firstName: "O",
    lastName: "y",
    primaryGroupId: "grp_a",
  });
  await approveMember(t.db, m.id, BOARD);

  await expect(
    grantRole(t.db, m.id, "event_organizer", localBoardOf("usr_lb", "grp_a"), "grp_a"),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
```

- [ ] **Step 6: Run the tests — expect PASS**

Run: `pnpm --filter @bdas/members test -- -t "event_organizer"`
Expected: PASS (DB-backed; skips if `DATABASE_URL` unreachable — then run in CI/Docker Postgres).

- [ ] **Step 7: Typecheck members + auth**

Run: `pnpm --filter @bdas/auth typecheck && pnpm --filter @bdas/members typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add modules/auth/src/sso.ts modules/members/src/roles.ts modules/members/src/services/roles.ts modules/members/migrations/0005_event_organizer.sql modules/members/src/index.test.ts
git commit -m "feat(members): group-scoped event_organizer role + grant authority (ADR 0017)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: members — surface organizers in the roster + audit views

**Files:**

- Modify: `modules/members/src/services/role-views.ts`
- Modify: `modules/members/src/index.test.ts` (new test)

**Interfaces:**

- Consumes: `event_organizer` grants written via Task 1.
- Produces: `listRoleHolders(db)` and `listGrantAudit(db, q)` include `event_organizer` rows (so the group roles UI can list/revoke organizers and the audit log records the grant).

- [ ] **Step 1: Widen the surfaced role set**

In `modules/members/src/services/role-views.ts`, replace the `BOARD_ROLES` constant (line 10) — rename to reflect it now includes the events delegate, and add `event_organizer`:

```typescript
// Roles surfaced in the group roster + audit views. event_organizer is a
// group-scoped events delegate (ADR 0017); it appears alongside the board roles.
const ROSTER_ROLES = [
  "federal_board",
  "local_board_lead",
  "local_board",
  "event_organizer",
] as const;
```

Update both usages (`inArray(memberRoleGrants.role, [...BOARD_ROLES])` in `listRoleHolders` line 35 and `listGrantAudit` line 52) to `[...ROSTER_ROLES]`.

- [ ] **Step 2: Write the failing test**

In `modules/members/src/index.test.ts`, add (alongside other `listRoleHolders` tests):

```typescript
it("listRoleHolders includes event_organizer grants", async () => {
  await createGroup("grp_a", "aachen");
  await createUser("usr_org3", "org3@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_org3",
    firstName: "Org",
    lastName: "Anita",
    primaryGroupId: "grp_a",
  });
  await approveMember(t.db, m.id, BOARD);
  await grantRole(t.db, m.id, "event_organizer", BOARD, "grp_a");

  const holders = await listRoleHolders(t.db);
  expect(holders).toContainEqual(
    expect.objectContaining({ memberId: m.id, role: "event_organizer", groupId: "grp_a" }),
  );
});
```

- [ ] **Step 3: Run the test + typecheck — expect PASS**

Run: `pnpm --filter @bdas/members test -- -t "listRoleHolders includes event_organizer" && pnpm --filter @bdas/members typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add modules/members/src/services/role-views.ts modules/members/src/index.test.ts
git commit -m "feat(members): surface event_organizer in roster + audit views

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: events — teach `Viewer`/`canManage`/`listManagedEvents` about organizer groups

**Files:**

- Modify: `modules/events/src/services/get.ts` (`Viewer`, `ANON`, `canManage`)
- Modify: `modules/events/src/services/list.ts` (`listManagedEvents`)
- Create: `modules/events/src/services/get.test.ts`
- Modify: `modules/events/src/index.test.ts` (Viewer literals + `listManagedEvents` test)
- Modify: `modules/notifications/src/subscribers.ts` (`SYSTEM_VIEWER` literal — keeps the workspace green)
- Modify: `apps/web/lib/event-viewer.ts` (`organizerGroupIds`)

**Interfaces:**

- Consumes: `Viewer` from `events/services/get.ts`.
- Produces: `Viewer.organizerGroupIds: ReadonlyArray<string>`; `canManage(v, event)` true when `event.groupId ∈ organizerGroupIds`; `listManagedEvents` returns an organizer's group events. `viewerFrom(me)` maps `event_organizer` grants into `organizerGroupIds`.

- [ ] **Step 1: Write the failing unit test for `canManage`**

Create `modules/events/src/services/get.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { ANON, canManage, type Viewer } from "./get";

const organizerOf = (groupId: string): Viewer => ({ ...ANON, organizerGroupIds: [groupId] });

describe("canManage with event_organizer", () => {
  it("an organizer manages events in its group", () => {
    expect(canManage(organizerOf("grp_a"), { groupId: "grp_a" })).toBe(true);
  });

  it("an organizer cannot manage another group's events", () => {
    expect(canManage(organizerOf("grp_a"), { groupId: "grp_b" })).toBe(false);
  });

  it("an organizer cannot manage federation-wide (null group) events", () => {
    expect(canManage(organizerOf("grp_a"), { groupId: null })).toBe(false);
  });

  it("federal board still manages everything", () => {
    expect(canManage({ ...ANON, isFederal: true }, { groupId: "grp_a" })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @bdas/events-module test -- get.test`
Expected: FAIL — `Viewer` has no `organizerGroupIds`; `ANON` spread is missing it (type error / property absent).

- [ ] **Step 3: Add `organizerGroupIds` to `Viewer`, `ANON`, and `canManage`**

In `modules/events/src/services/get.ts`, add the field to the `Viewer` type (after `boardGroupIds`):

```typescript
  /** Groups the viewer belongs to (gates `group_only` events). */
  readonly memberGroupIds: ReadonlyArray<string>;
  /** Federal board sees and manages everything. */
  readonly isFederal: boolean;
  /** Groups the viewer is local board of (sees drafts + manages those events). */
  readonly boardGroupIds: ReadonlyArray<string>;
  /** Groups the viewer is an event_organizer of (manages those events; ADR 0017). */
  readonly organizerGroupIds: ReadonlyArray<string>;
```

Add it to `ANON`:

```typescript
export const ANON: Viewer = {
  isActiveMember: false,
  memberGroupIds: [],
  isFederal: false,
  boardGroupIds: [],
  organizerGroupIds: [],
};
```

Extend `canManage`:

```typescript
/** Whether the viewer may create/edit/publish/cancel/delete this event. */
export function canManage(v: Viewer, event: Pick<EventItem, "groupId">): boolean {
  if (v.isFederal) return true;
  if (event.groupId === null) return false;
  return v.boardGroupIds.includes(event.groupId) || v.organizerGroupIds.includes(event.groupId);
}
```

- [ ] **Step 4: Run the unit test — expect PASS**

Run: `pnpm --filter @bdas/events-module test -- get.test`
Expected: PASS.

- [ ] **Step 5: Union organizer groups into `listManagedEvents`**

In `modules/events/src/services/list.ts`, replace the `listManagedEvents` body so the non-federal branch selects board ∪ organizer groups:

```typescript
export async function listManagedEvents(
  db: Db,
  viewer: Viewer,
): Promise<ReadonlyArray<EventWithCounts>> {
  if (viewer.isFederal) {
    const rows = await db.select().from(events).orderBy(asc(events.startsAt));
    return withCounts(db, rows);
  }
  const manageGroupIds = [...new Set([...viewer.boardGroupIds, ...viewer.organizerGroupIds])];
  if (manageGroupIds.length === 0) return withCounts(db, []);
  const rows = await db
    .select()
    .from(events)
    .where(inArray(events.groupId, manageGroupIds))
    .orderBy(asc(events.startsAt));
  return withCounts(db, rows);
}
```

- [ ] **Step 6: Update the events integration-test Viewer literals + add a `listManagedEvents` test**

In `modules/events/src/index.test.ts`, add `organizerGroupIds: []` to the `ACTIVE`, `ANON_VIEWER`, and `FEDERAL` literals (lines 52–69). Then add:

```typescript
it("listManagedEvents includes an organizer's group events, not other groups'", async () => {
  await createEvent(t.db, { title: "Aachen-Fest", startsAt: future(), groupId: "grp_a" }, "usr_c");
  await createEvent(t.db, { title: "Bonn-Fest", startsAt: future(), groupId: "grp_b" }, "usr_c");

  const organizer: Viewer = {
    isActiveMember: true,
    memberGroupIds: [],
    isFederal: false,
    boardGroupIds: [],
    organizerGroupIds: ["grp_a"],
  };
  const managed = await listManagedEvents(t.db, organizer);
  const titles = managed.map((e) => e.title);
  expect(titles).toContain("Aachen-Fest");
  expect(titles).not.toContain("Bonn-Fest");
});
```

(`listManagedEvents` and the `Viewer` type are already imported in this test file — lines 18–19 — so no new imports are needed.)

- [ ] **Step 7: Keep the workspace green — update the two remaining `Viewer` literals**

In `modules/notifications/src/subscribers.ts`, add the field to `SYSTEM_VIEWER`:

```typescript
const SYSTEM_VIEWER: Viewer = {
  isActiveMember: true,
  memberGroupIds: [],
  isFederal: true,
  boardGroupIds: [],
  organizerGroupIds: [],
};
```

In `apps/web/lib/event-viewer.ts`, map `event_organizer` grants into the viewer (mirrors the `boardGroupIds` filter):

```typescript
return {
  isActiveMember: me.member?.status === "active",
  memberGroupIds: me.member?.primaryGroupId ? [me.member.primaryGroupId] : [],
  isFederal: isFederalBoard(me.grants),
  boardGroupIds: me.grants
    .filter((g) => (g.role === "local_board" || g.role === "local_board_lead") && g.groupId)
    .map((g) => g.groupId as string),
  organizerGroupIds: me.grants
    .filter((g) => g.role === "event_organizer" && g.groupId)
    .map((g) => g.groupId as string),
};
```

- [ ] **Step 8: Add a `viewerFrom` unit test**

Create `apps/web/lib/event-viewer.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { viewerFrom } from "./event-viewer";

describe("viewerFrom", () => {
  it("maps event_organizer grants into organizerGroupIds", () => {
    const v = viewerFrom({
      user: { id: "usr_1" },
      member: { status: "active", primaryGroupId: "grp_a" },
      grants: [{ role: "event_organizer", groupId: "grp_a" }],
    } as never);
    expect(v.organizerGroupIds).toEqual(["grp_a"]);
    expect(v.boardGroupIds).toEqual([]);
  });
});
```

- [ ] **Step 9: Run events tests + workspace typecheck — expect PASS**

Run: `pnpm --filter @bdas/events-module test && pnpm --filter web test -- event-viewer && pnpm --filter @bdas/events-module typecheck && pnpm --filter @bdas/notifications typecheck && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add modules/events/src/services/get.ts modules/events/src/services/get.test.ts modules/events/src/services/list.ts modules/events/src/index.test.ts modules/notifications/src/subscribers.ts apps/web/lib/event-viewer.ts apps/web/lib/event-viewer.test.ts
git commit -m "feat(events): organizer-aware Viewer/canManage/listManagedEvents (ADR 0017)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: apps/web — open the management surface to organizers + add the grant UI

**Files:**

- Modify: `apps/web/app/admin/events/page.tsx` (access gate)
- Modify: `apps/web/app/admin/events/neu/page.tsx` (access gate + group list)
- Modify: `apps/web/app/admin/events/actions.ts` (create/update authorization)
- Modify: `apps/web/app/(board)/_components/RoleRoster.tsx` (role label)
- Modify: `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx` (grant option + roster section)

**Interfaces:**

- Consumes: `viewerFrom`/`canManage` (Task 3), `event_organizer` grants (Task 1), roster views (Task 2). `role-actions.ts` (`grantRoleAction`/`revokeRoleAction`) already passes `role` through to the validated `grantRole`/`revokeRole` — no change needed there.
- Produces: organizers can reach `/admin/events`, `/admin/events/neu`, `/admin/events/<id>`; leads can grant/revoke `event_organizer` from the group `vorstand` page.

- [ ] **Step 1: Let organizers reach the management list**

In `apps/web/app/admin/events/page.tsx`, replace the gate:

```typescript
if (
  !viewer.isFederal &&
  viewer.boardGroupIds.length === 0 &&
  viewer.organizerGroupIds.length === 0
) {
  redirect("/account");
}
```

- [ ] **Step 2: Let organizers reach the create form (and pick their group)**

In `apps/web/app/admin/events/neu/page.tsx`, replace the gate and the group filter:

```typescript
if (
  !viewer.isFederal &&
  viewer.boardGroupIds.length === 0 &&
  viewer.organizerGroupIds.length === 0
) {
  redirect("/account");
}

const allGroups = await listGroups(db, { status: "active" });
const manageGroupIds = new Set([...viewer.boardGroupIds, ...viewer.organizerGroupIds]);
const groups = viewer.isFederal ? allGroups : allGroups.filter((g) => manageGroupIds.has(g.id));
```

(`allowFederation={viewer.isFederal}` stays — only federal board creates federation-wide events.)

- [ ] **Step 3: Authorize create/update via the events viewer (so organizers can write)**

In `apps/web/app/admin/events/actions.ts`, replace the `groupAuthError` helper (lines 102–115) to use the events `canManage` predicate (which now includes organizer groups):

```typescript
/** Authorize the caller may target this group for an event write: federal (null
 *  group) or board/organizer of the group. Mirrors events `canManage`. */
function groupAuthError(
  me: Awaited<ReturnType<typeof currentMember>>,
  groupId: string | null,
): string | null {
  if (canManage(viewerFrom(me), { groupId })) return null;
  return groupId
    ? "Du darfst für diese Gruppe keine Veranstaltung anlegen."
    : "Nur der Bundesvorstand darf föderationsweite Veranstaltungen anlegen.";
}
```

Then drop the now-unused imports on line 20 — change:

```typescript
import { canManageGroup, getCurrentMember, isFederalBoard } from "@bdas/members";
```

to:

```typescript
import { getCurrentMember } from "@bdas/members";
```

(`canManage` and `viewerFrom` are already imported in this file.)

- [ ] **Step 4: Label the organizer role in the roster**

In `apps/web/app/(board)/_components/RoleRoster.tsx`, extend `ROLE_LABEL`:

```typescript
const ROLE_LABEL: Record<string, string> = {
  federal_board: "Bundesvorstand",
  local_board_lead: "Lead",
  local_board: "Vorstand",
  event_organizer: "Organisator",
};
```

- [ ] **Step 5: Offer the grant + show organizers on the group vorstand page**

In `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx`, add `event_organizer` to the `GrantRoleModal` `roleOptions` (the page is already `requireLeadScope`-gated, so only leads/federal see it; `grantRole` re-checks):

```tsx
          roleOptions={[
            { role: "local_board", label: "Vorstand", groupId },
            { role: "event_organizer", label: "Organisator", groupId },
          ]}
```

and add a roster section:

```tsx
          sections={[
            { title: "Leads", holders: ofGroup.filter((h) => h.role === "local_board_lead") },
            { title: "Vorstand", holders: ofGroup.filter((h) => h.role === "local_board") },
            {
              title: "Organisatoren",
              holders: ofGroup.filter((h) => h.role === "event_organizer"),
            },
          ]}
```

- [ ] **Step 6: Typecheck the web app**

Run: `pnpm --filter web typecheck`
Expected: PASS (no unused-import errors from the `actions.ts` change).

- [ ] **Step 7: Manual verification (record results in the PR)**

With the events flag on and a Postgres available:

1. As a lead of group A, open `/gruppe/<slug-A>/vorstand`, grant **Organisator** to member M. Confirm M appears under "Organisatoren".
2. Sign in as M (no board role). Visit `/admin/events` → the list loads (not redirected to `/account`) and shows group A's events. Open one → the manage page loads; create a new event for group A; publish, then cancel it.
3. Confirm M cannot see another group's events and `/admin/events/neu` only offers group A.
4. Back as the lead, revoke M's Organisator role; confirm M is redirected away from `/admin/events`.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/admin/events/page.tsx" "apps/web/app/admin/events/neu/page.tsx" "apps/web/app/admin/events/actions.ts" "apps/web/app/(board)/_components/RoleRoster.tsx" "apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx"
git commit -m "feat(web): organizer access to event management + grant UI in group roles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: notifications — welcome + removal emails on organizer grant/revoke

**Files:**

- Modify: `modules/notifications/package.json` (add `@bdas/groups`, `@bdas/members` workspace deps)
- Modify: `modules/notifications/src/types.ts` (templates + `groupName`)
- Modify: `modules/notifications/src/templates.ts` (two cases)
- Modify: `modules/notifications/src/services/send.ts` (`groupName` passthrough)
- Modify: `modules/notifications/src/subscribers.ts` (role-event subscription)
- Modify: `modules/notifications/src/templates.test.ts` (render tests)
- Modify: `modules/notifications/src/index.test.ts` (subscriber routing test)

**Interfaces:**

- Consumes: `members.role.granted` / `members.role.revoked` (types `RoleGranted`/`RoleRevoked` exported from `@bdas/members`), `getGroup` from `@bdas/groups`, `sendTransactional`.
- Produces: emails `event_organizer_granted` / `event_organizer_revoked` sent only for `role === "event_organizer"` role events.

- [ ] **Step 1: Extend the template union + data**

In `modules/notifications/src/types.ts`, add the two templates to `TransactionalTemplate`:

```typescript
export type TransactionalTemplate =
  | "event_registration_confirmed"
  | "event_waitlisted"
  | "event_deregistration_confirmed"
  | "event_waitlist_promoted"
  | "event_changed"
  | "event_cancelled"
  | "event_organizer_message"
  | "event_organizer_granted"
  | "event_organizer_revoked";
```

and add an optional `groupName` to `TemplateData` (after `messageBody`):

```typescript
  /** `event_organizer_*`: the group the organizer role applies to. */
  readonly groupName?: string | undefined;
```

- [ ] **Step 2: Write the failing render tests**

In `modules/notifications/src/templates.test.ts`, add:

```typescript
it("organizer-granted names the group and links to management", () => {
  const out = render("event_organizer_granted", {
    firstName: "Mara",
    eventTitle: "",
    eventUrl: "https://dashboard.bdas.de/admin/events",
    groupName: "Aachen",
  });
  expect(out.subject).toContain("Organisator");
  expect(out.text).toContain("Mara");
  expect(out.text).toContain("Aachen");
  expect(out.html).toContain("https://dashboard.bdas.de/admin/events");
});

it("organizer-revoked signals the role was removed", () => {
  const out = render("event_organizer_revoked", {
    firstName: "Mara",
    eventTitle: "",
    groupName: "Aachen",
  });
  expect(out.subject).toContain("entzogen");
  expect(out.text).toContain("Aachen");
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `pnpm --filter @bdas/notifications test -- templates`
Expected: FAIL — `render` switch is non-exhaustive / missing cases.

- [ ] **Step 4: Implement the two template cases**

In `modules/notifications/src/templates.ts`, add to the `switch (template)` in `render` (after the `event_organizer_message` case, before the closing brace):

```typescript
    case "event_organizer_granted":
      return body(
        "BDAS — Du bist jetzt Veranstaltungs-Organisator:in",
        firstName,
        `du wurdest als Organisator:in für die Gruppe „${data.groupName ?? "deine Gruppe"}“ eingetragen. Du kannst ab sofort die Veranstaltungen dieser Gruppe anlegen und verwalten.`,
        eventUrl ? { label: "Zur Veranstaltungsverwaltung:", url: eventUrl } : undefined,
      );
    case "event_organizer_revoked":
      return body(
        "BDAS — Organisator:innen-Rolle entzogen",
        firstName,
        `deine Organisator:innen-Rolle für die Gruppe „${data.groupName ?? "deine Gruppe"}“ wurde entzogen. Du kannst die Veranstaltungen dieser Gruppe nicht mehr verwalten.`,
      );
```

- [ ] **Step 5: Pass `groupName` through `sendTransactional`**

In `modules/notifications/src/services/send.ts`, add `groupName` to the `extra` parameter type and to the `data` object, and make `eventTitle` optional (organizer emails have no event):

```typescript
  extra: {
    readonly eventTitle?: string | undefined;
    readonly eventId?: string | undefined;
    readonly eventUrl?: string | undefined;
    readonly changes?: ReadonlyArray<EventChangeKind> | undefined;
    readonly subject?: string | undefined;
    readonly messageBody?: string | undefined;
    readonly groupName?: string | undefined;
  },
```

```typescript
const data: TemplateData = {
  firstName: contact.firstName,
  eventTitle: extra.eventTitle ?? "",
  eventUrl: extra.eventUrl,
  changes: extra.changes,
  subject: extra.subject,
  messageBody: extra.messageBody,
  groupName: extra.groupName,
};
```

- [ ] **Step 6: Run render tests + typecheck — expect PASS**

Run: `pnpm --filter @bdas/notifications test -- templates && pnpm --filter @bdas/notifications typecheck`
Expected: PASS.

- [ ] **Step 7: Add the workspace dependencies the subscriber needs**

The subscriber reads group names (`@bdas/groups`) and the role-event types
(`@bdas/members`) — neither is a current dependency. In
`modules/notifications/package.json` `dependencies`, add (keeping alphabetical
order with the existing `@bdas/*` entries):

```json
    "@bdas/groups": "workspace:*",
    "@bdas/members": "workspace:*",
```

Then run `pnpm install`. (No cycle: neither `groups` nor `members` depends on
`notifications`.)

- [ ] **Step 8: Subscribe to the role events**

In `modules/notifications/src/subscribers.ts`, add imports:

```typescript
import { getGroup } from "@bdas/groups";
import type { RoleGranted, RoleRevoked } from "@bdas/members";
```

Inside `registerNotificationSubscribers`, append to the `subs` array (after the `events.event.cancelled` subscription) — the deep link points organizers at the events management home:

```typescript
    // A member was granted/removed as event_organizer for a group (ADR 0017) —
    // email only that member; ignore every other role's grant events.
    getEventBus().subscribe<RoleGranted>(
      "members.role.granted",
      safe<RoleGranted>(async (e) => {
        if (e.role !== "event_organizer" || !e.groupId) return;
        const group = await getGroup(db, e.groupId);
        await sendTransactional(db, "event_organizer_granted", e.memberId, {
          groupName: group?.name,
          eventUrl: opts.siteUrl
            ? `${opts.siteUrl.replace(/\/$/, "")}/admin/events`
            : undefined,
        });
      }),
    ),
    getEventBus().subscribe<RoleRevoked>(
      "members.role.revoked",
      safe<RoleRevoked>(async (e) => {
        if (e.role !== "event_organizer" || !e.groupId) return;
        const group = await getGroup(db, e.groupId);
        await sendTransactional(db, "event_organizer_revoked", e.memberId, {
          groupName: group?.name,
        });
      }),
    ),
```

- [ ] **Step 9: Write the subscriber routing test**

In `modules/notifications/src/index.test.ts`, add (mirroring the existing bus-publish tests — `setNotifier` captures `OutboundEmail`s, `setRecipientResolver` returns a fixed contact, `registerNotificationSubscribers`/`unregisterNotificationSubscribers` wrap the body):

```typescript
it("emails the new organizer on members.role.granted, and ignores other roles", async () => {
  const sent: OutboundEmail[] = [];
  setNotifier({
    async send(m: OutboundEmail) {
      sent.push(m);
    },
  });
  setRecipientResolver({
    async resolve() {
      return { email: "org@example.de", firstName: "Mara" };
    },
  });
  registerNotificationSubscribers(t.db, { siteUrl: "https://dashboard.bdas.de" });

  // A non-organizer role grant must NOT send an organizer email.
  await getEventBus().publish({
    type: "members.role.granted",
    memberId: "mem_x",
    role: "local_board",
    groupId: "grp_a",
    actorUserId: "usr_lead",
    at: new Date(),
  });
  expect(sent).toHaveLength(0);

  await getEventBus().publish({
    type: "members.role.granted",
    memberId: "mem_x",
    role: "event_organizer",
    groupId: "grp_a",
    actorUserId: "usr_lead",
    at: new Date(),
  });
  await new Promise((r) => setTimeout(r, 0)); // let the async handler settle
  expect(sent).toHaveLength(1);
  expect(sent[0]!.subject).toContain("Organisator");

  unregisterNotificationSubscribers();
});
```

- [ ] **Step 10: Run notifications tests + typecheck — expect PASS**

Run: `pnpm --filter @bdas/notifications test && pnpm --filter @bdas/notifications typecheck`
Expected: PASS (DB tests skip when `DATABASE_URL` unreachable — run in CI/Docker Postgres).

- [ ] **Step 11: Commit**

```bash
git add modules/notifications/package.json modules/notifications/src/types.ts modules/notifications/src/templates.ts modules/notifications/src/services/send.ts modules/notifications/src/subscribers.ts modules/notifications/src/templates.test.ts modules/notifications/src/index.test.ts pnpm-lock.yaml
git commit -m "feat(notifications): organizer grant/revoke emails (ADR 0017)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Wrap-up (after all tasks)

- [ ] **Full check across touched packages**

Run: `pnpm --filter @bdas/auth --filter @bdas/members --filter @bdas/events-module --filter @bdas/notifications --filter web typecheck && pnpm --filter @bdas/members --filter @bdas/events-module --filter @bdas/notifications --filter web test`
Expected: PASS (DB-backed suites skip locally without Postgres; ensure they run green in CI).

- [ ] **Update the README** for the events delegation surface if a per-module README documents roles (`modules/members/README.md` role list — add `event_organizer`).

- [ ] **Run `/security-review`** (new authorization role, CLAUDE.md §4) and `/review`, then open the PR. Note in the PR description: overrides the parent spec's event-scoped organizer decision per **ADR 0017**; migration `members/0005_event_organizer.sql` is additive (CHECK domain only).

```

```
