# Design: Event Pages — Slice 3: `event_organizer` role (group-scoped)

**Date:** 2026-06-27
**Status:** Approved design, pre-plan
**Module:** `members` (role domain + grant auth), `events` (viewer/visibility), `apps/web` (roles admin UI + event create auth), `notifications` (grant/revoke email)
**Feature flag:** rides the existing events flag — no new flag.
**Supersedes:** the parent spec's locked decision "Organizer delegation → scoped role `event_organizer:<event_id>`" — see ADR 0017.

---

## 1. Problem

Slices 1–2 gave events a real page and an attendee roster, but every management
action is still gated to **board members only** (`canManage` = federal board OR
`local_board`/`local_board_lead` of the event's group). There is no way to let a
trusted non-board member run a group's events. This slice adds a delegable
**`event_organizer`** role.

## 2. Decision change vs the approved spec

The parent spec (`2026-06-26-event-pages-design.md`) locked `event_organizer`
as **scoped to a single event** with a permission boundary that kept
cancel/delete/grant board-only. During Slice 3 brainstorming the federation
changed two things:

| Parent spec (locked)                                   | Slice 3 (this design)                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Scoped to one **event** (`event_organizer:<event_id>`) | Scoped to one **group** (`event_organizer:<group_id>`) — organizes all its events |
| Organizer may NOT cancel/delete the event              | Organizer has **full event lifecycle**, including cancel/delete                   |
| Granted from the event manage page by any board member | Granted from the **group roles admin** by a **board lead** (or federal) only      |
| Grant emits an events-module `organizer.granted` event | Reuses the existing `members.role.granted` / `.revoked` bus events                |
| Email on grant only                                    | Email on **both** grant and revoke                                                |

The change is recorded in **ADR 0017** because it overrides a locked decision in
an approved spec (source-of-truth precedence, CLAUDE.md §8).

Net effect: `event_organizer` is **"`local_board`, restricted to the events
surface"** — a per-group events delegate with no member-admin powers and no
ability to grant or revoke roles.

## 3. Model

`event_organizer` is a new **group-scoped** value in `member_role_grants`,
a sibling of `local_board`/`local_board_lead`. The scope column (`group_id`),
the active-unique index (`COALESCE(group_id,'')`), the revoke columns, and the
`effectiveGrants` path are all reused. No new table.

Adding the role follows the ADR 0013 convention — widen the role domain in three
synced places:

1. **auth `Role` union** (`modules/auth/src/sso.ts`) — `event_organizer` joins
   the known-role domain. As with `local_board_lead`, it is **never granted at
   login** (the JWT allowlist still only attaches `federal_board`); it flows only
   from DB grants via `effectiveGrants`. So widening the union is inert for SSO.
2. **members `ALL_ROLES` / `isRole`** (`modules/members/src/roles.ts`).
3. **`member_role_grants_role_check`** — a new migration
   `modules/members/migrations/0005_event_organizer.sql` drops and recreates the
   CHECK to include `event_organizer` (same drop+recreate shape as `0003`).

## 4. Permissions

| Action                                                            | federal_board | local_board / lead (of group) | **event_organizer (of group)** | member |
| ----------------------------------------------------------------- | :-----------: | :---------------------------: | :----------------------------: | :----: |
| create / edit / publish / **cancel / delete** event (their group) |       ✓       |               ✓               |             **✓**              |   ✗    |
| roster: cancel-for / add walk-in / email-all / CSV export         |       ✓       |               ✓               |             **✓**              |   ✗    |
| grant / revoke `event_organizer`                                  |       ✓       |         **lead only**         |               ✗                |   ✗    |
| member admin (approve members, grant other roles)                 |       ✓       |               ✓               |               ✗                |   ✗    |

Two authorization rules express the whole matrix:

- **Manage an event** = `canManage(viewer, event)` = `isFederal` OR
  `event.groupId ∈ boardGroupIds` OR `event.groupId ∈ organizerGroupIds`.
  Federation-wide events (`groupId === null`) remain federal-only, because an
  organizer's group id never equals `null`.
- **Grant/revoke `event_organizer`** = `canGrantLocalBoard` rule (federal OR
  `local_board_lead` of that group). A plain `local_board` grant does **not**
  confer it — matching ADR 0013.

## 5. Module changes

### `members`

- Widen auth `Role`, `ALL_ROLES`/`isRole`, and add migration
  `0005_event_organizer.sql` (CHECK constraint), per §3.
- `requireValidScope`: `event_organizer` requires a group (reject `null`), like
  `local_board`.
- `requireCanGrant`: `event_organizer` → `canGrantLocalBoard(actor, groupId)`
  (federal OR lead-of-group). One added branch in the existing chokepoint.
- Grant/revoke already emit `members.role.granted` / `members.role.revoked` on
  the core bus with `{ memberId, role, groupId, actorUserId, at }` — reused
  unchanged. (`role` is already typed `Role`, now including `event_organizer`.)

### `events`

- `Viewer` gains `organizerGroupIds: ReadonlyArray<string>`. `ANON` and the
  notifications `SYSTEM_VIEWER` add `organizerGroupIds: []`.
- `canManage` includes `organizerGroupIds` (one clause). Because `canView`
  delegates to `canManage`, organizers automatically see their group's drafts.
- `listManagedEvents` unions `boardGroupIds ∪ organizerGroupIds` when selecting
  manageable rows, so organizers see their group's events (incl. drafts) in the
  management list and the dashboard drill-in.

### `apps/web`

- `viewerFrom` (`apps/web/lib/event-viewer.ts`) populates `organizerGroupIds`
  from grants where `role === "event_organizer"` (mirrors the `boardGroupIds`
  filter).
- Event **create/update** group authorization switches from members'
  `canManageGroup` to events' `canManage(viewer, { groupId })` so organizers can
  create events for their group while federation-wide (null group) stays
  federal-only. (`createEventAction`/`updateEventAction` in
  `app/admin/events/actions.ts`.)
- **Roles admin** on the group `vorstand` page gains `event_organizer`:
  - `GrantRoleModal` offers it as a grantable role (visible only to lead/federal).
  - `RoleRoster` lists current organizers with a revoke control.
  - `role-actions.ts` grant/revoke server actions accept `event_organizer`,
    authorizing the **destination** (group + lead/federal) before delegating to
    `members.grantRole` / `revokeRole`.
  - It is **not** added to the event manage page.

### `notifications`

- New subscriber wiring `members.role.granted` / `members.role.revoked`,
  **filtered to `role === "event_organizer"`**, sending:
  - `event_organizer_granted` — welcome email with a deep link to the group's
    events admin.
  - `event_organizer_revoked` — "you are no longer an organizer" email.
- Resolve the group display name for the email (via members' public group read);
  resolve the recipient by `memberId` through the existing resolver.
- Handlers wrapped in the existing `safe()` (never throw into the bus). This adds
  a `notifications → members` event-type dependency (one-way, no cycle).

## 6. Module-rule adherence (CLAUDE.md §1, §3)

- `members` owns role grants; the app delegates to `members.grantRole` /
  `revokeRole` — no direct writes to members' tables (rule 1).
- `events` exposes the widened `Viewer`/`canManage` from its `index.ts` (rule 8);
  it never learns about members internals — the app assembles the viewer.
- Cross-module email goes through the bus (`members.role.*` → `notifications`)
  rather than a direct call (rule 2/3); dependency stays one-way.
- Tests ship in-PR, integration-tested against real Postgres (§4).

## 7. Tests

- **members** (integration, real PG): granting `event_organizer` requires a group
  and lead/federal authority; a plain `local_board` actor is rejected; revoke;
  `effectiveGrants` surfaces the grant; the CHECK constraint accepts the new
  value.
- **events** (unit): `canManage` true for an organizer of the event's group,
  false for another group and for `groupId === null`; `listManagedEvents`
  includes an organizer's group events.
- **notifications**: subscriber routes only `event_organizer` role events (not
  `local_board`) to the two new templates; templates render; `safe()` swallows a
  failing send.
- **apps/web**: `viewerFrom` maps `event_organizer` grants to `organizerGroupIds`.

## 8. Out of scope

- Per-event organizer scoping (replaced by group scoping).
- An organizer-grant control on the event manage page (lives in group roles admin).
- Guest registration and all `allow_guest_registration` concerns (Slice 4).
- Any change to what `local_board` / `local_board_lead` can already do.

## 9. Migration

One additive migration: `modules/members/migrations/0005_event_organizer.sql`
(drop + recreate `member_role_grants_role_check` to add `event_organizer`).
Additive, no backfill; existing grants unaffected. Registered in the
`infra/migrations` manifest order after members `0004` (rule 7).
