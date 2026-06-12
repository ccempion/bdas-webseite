# Phase 3 — Board Dashboard ("the cockpit") — Design

- **Date:** 2026-06-11
- **Status:** Approved (design); implementation pending plan
- **Supersedes/relies on:** ADR 0005 (single app), ADR 0007 (scoped grants), spec §13

## 1. Goal

Stand up the board-facing cockpit: the surfaces where local and federal boards run
the federation day to day — see members/events/groups, approve pending members,
manage files, and grant board roles. Primarily a UI/UX design task on top of
modest read-surface additions to existing modules.

## 2. Container — route groups in `apps/web`, not a separate app

Spec §13 prescribes a separate `apps/dashboard` at its own domain. **ADR 0005
supersedes that:** one Next.js app (`apps/web`), board surfaces as a route group
gated by role checks. This phase builds that route group and replaces the
temporary `/admin/*` stopgaps (pending-members, gruppen, events) introduced in
Phase 1 Sprint 3.

The dashboard **owns no tables and issues no raw SQL** (spec §13 hard rule). Every
tile, table, and chart calls a typed read method on a module's `index.ts`.

## 3. Scope of Phase 3

**In scope** (reads from shipped modules: members, events, groups, files):

- Shell + scope-switcher + scope landing.
- Federal: overview, members, events, groups, roles, files.
- Local: overview, members (roster + approve pending), events, profile, vorstand, files.
- Role delegation model (`local_board_lead`) + the two role surfaces.
- Module read-method additions + route-group access gates.

**Deferred** (depend on unbuilt work; not in this phase):

| Surface / feature                                  | Blocked on                              |
| -------------------------------------------------- | --------------------------------------- |
| Payments tab, dues/donations tiles, payments chart | `payments` module (Phase 6)             |
| Decide group-change requests                       | `group_change_requests` table (Phase 6) |
| Join-policy editor                                 | `groups.join_fee_*` columns (Phase 6)   |
| Broadcasts (federal + local)                       | deferred per Phase 2 notes              |
| Handover, Projects tabs                            | no module exists                        |
| Notification-log surfacing                         | optional; deferred                      |

## 4. Locked design decisions

1. **Shell — scope-switcher dropdown at the top of the sidebar.** A pill names the
   active scope ("Bundesverband" / a group); selecting one swaps the nav list below
   to that scope's pages. One cockpit, scope changes without a URL change (spec §13).
   Sidebar collapses on mobile (375/768/1280 per spec §20).
2. **Overview — hybrid.** A slim action strip at the top (lit only when there is
   work: pending approvals, events awaiting publish), then stats tiles, then one
   trend chart. Volunteer boards check in infrequently; unhandled work must not be
   buried, but the page still reads as a cockpit.
3. **Member table — hybrid (inline quick-action + drawer).** Default columns:
   **name · group · status · joined**. Inline Freigeben/Ablehnen for the common
   case; click the row to open a right-side drawer with full profile, status
   history, and rarer actions (role grants, re-verification). This table is the
   template the events/groups/files tables reuse.
4. **Role delegation — `local_board_lead`.** See §5.
5. **Access enforcement — route-group layout gates, not edge middleware.** See §6.
6. **Data layer — scope-parameterised read methods.** See §7.

## 5. Role delegation model

**Intent:** the federal board no longer grants every `local_board` centrally.
Instead it appoints **local board leads** per group; a lead manages their own
group's `local_board` roster. Federal retains control of _who the leads are_ and of
`federal_board`.

- New scoped grant **`local_board_lead`** (group-scoped, like `local_board`).
- **Several co-leads per group are allowed** — no uniqueness constraint.
- A lead may grant/revoke `local_board:[their own group]` to members of that group.
- A lead may **not** appoint other leads, grant `federal_board`, or touch another group.
- Federal board is a superset: may grant any role in any group directly.

### Two surfaces

- **Federal `/federal/roles`** — roster-first. Sections: Bundesvorstand holders;
  Local leads (grouped by group). "+ Rolle erteilen" opens a search-member card to
  grant `federal_board` or `local_board_lead:[group]`. Audit-log as a second tab.
- **Local lead `/gruppe/[slug]/vorstand`** — roster of that group's `local_board` +
  leads. "+ Vorstand hinzufügen" grants `local_board` to a member of the group.
  Audit-log tab. Visible only to a lead of that group (or federal).

Granting `federal_board` requires a **typed confirmation** (enter the member's name),
not a plain dialog — it is the highest-privilege act on the platform.

### Blast radius (implementation)

The "who may grant" decision lives in a single chokepoint, `requireBoard(actor)` in
`modules/members/src/services/roles.ts`. No other module is affected
(`canManageGroup`, approvals, files, events already handle local scope correctly).

| #   | Change                                                                                                                                                                                                                                              | Notes                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | `modules/auth/src/sso.ts` — add `local_board_lead` to the `Role` union                                                                                                                                                                              | 1 line                                          |
| 2   | `modules/members/src/roles.ts` — add to `ALL_ROLES`; new predicate `canGrantLocalBoard(grants, groupId)` = federal **or** `local_board_lead:[group]`                                                                                                | ~6 lines                                        |
| 3   | `modules/members/src/services/roles.ts` — replace `requireBoard` with a scope-aware `requireCanGrant(actor, role, groupId)`; appointing a lead or `federal_board` stays federal-only; `requireValidScope` treats `local_board_lead` as group-scoped | ~15 lines                                       |
| 4   | Migration in `modules/members/migrations/` — drop + recreate `member_role_grants_role_check` to allow `'local_board_lead'`                                                                                                                          | trivial; no enum churn (role is `text` + CHECK) |
| 5   | Tests — update `index.test.ts:203` ("federal-only" assertion is now conditional); add lead-grants-local-board and lead-cannot-cross-group tests                                                                                                     | —                                               |
| 6   | New ADR — reverses the "only `federal_board` may grant" statement in ADR 0007 and the `roles.ts` header (CLAUDE.md §4 requires the decision be recorded)                                                                                            | doc                                             |

Existing grants are unaffected; leads are purely additive. No data backfill.

## 6. Access enforcement

Edge middleware is rejected: the session JWT carries only `federal_board` (login
allowlist per ADR 0002); `local_board` and `local_board_lead` grants live in the DB,
so a middleware gate cannot decide local-scope access without a DB call (an
anti-pattern). Gating happens in the route-group layers where DB access is normal:

```
app/(board)/
├── layout.tsx              requireBoardAccess()      — any board grant, else → /account
├── page.tsx                scope landing / picker
├── federal/
│   ├── layout.tsx          requireFederalBoard
│   ├── overview/  members/  events/  groups/  roles/  files/
└── gruppe/[slug]/
    ├── layout.tsx          requireManageGroup(slug)  — federal OR local_board / lead of slug
    ├── overview/  members/  events/  profile/  files/
    └── vorstand/           additionally requireCanGrantLocalBoard(slug) — lead-only
```

A new `requireRoleGrant` / `requireManageGroup` helper lands beside the existing
`requireFederalBoard`. Board routes stay `force-dynamic` (per-request session + DB),
matching the established `/admin/*` pattern. `/security-review` is required on the
roles and enforcement PRs (CLAUDE.md §4).

**Deferred follow-up (post-merge scope, LOW):** the "local boards may not manage an
archived group" rule (ADR-0013 / product decision 2026-06-12) is enforced only on the
read/scope path — `canSeeGroupScope` + `boardScopes`. The **write actions**
(`updateGroupProfileAction`, `grantRoleAction`/`revokeRoleAction` via
`canGrantLocalBoard`/`canManageGroup`) do not yet check group status, so a lead of a
since-archived group can still edit its profile or hand out `local_board` within it by
calling the action directly. Low impact (no cross-group escalation, defunct group only).
Fix when convenient: thread group status into `canManageGroup`/`canGrantLocalBoard` so
the rule holds in the service, not just the UI gate.

## 7. Data layer — read methods added to module surfaces

`Scope = { kind: 'federal' } | { kind: 'group'; groupId: string }`, so one dashboard
table/tile component drives both federal and local views.

- **members:** `listMembers({ scope, status?, role?, search? })`,
  `countMembersByStatus(scope)`, `signupsOverTime(scope)`, `listBoardRoster(groupId)`,
  `listLeadsByGroup()`.
- **events:** `listEvents({ scope })`, `attendanceOverTime(scope)`, upcoming count.
- **groups:** `listGroups` (exists), `createGroup` / `archiveGroup` (exist in
  `manage.ts`), `groupStats(groupId)`.
- **files:** `listFolders(scope)`, `listAccessLog(scope)`.

All are reads (plus the already-existing grant/approve/create writes); the dashboard
composes them. No new tables, no cross-module deep imports.

## 8. Overview content (Phase 3, payments-free)

- **Action strip (lit only when > 0):** pending member approvals; events awaiting
  publish. (Group-change requests excluded — Phase 6.)
- **Tiles:** active members; new signups (30d); upcoming events; (federal also) active
  groups. Dues/donations tiles deferred (Phase 6).
- **Trend:** signups over time (federal + local); event attendance over time.

## 9. Visual language

Consume `core/design-system` tokens only (CLAUDE.md §7): accent `#d12020` for
active/open states; radii 6/12/20px; soft layered shadows; ink scale `#333/#555/#888`;
`<details>` accordion idiom where disclosure is needed. No inline hex/radius/shadow.

## 10. Testing

- Integration tests against Docker Postgres (no DB mocks, CLAUDE.md §4): delegation
  authorization (lead grants within group; lead blocked cross-group; lead cannot
  appoint lead/federal); each scope gate redirects an unauthorized user; `listMembers`
  scope filtering.
- A regression test that a member without grants gets redirected from every
  `(board)` route (the ADR-0005 mitigation).

## 11. ADRs to write during implementation

1. **Role delegation (`local_board_lead`)** — reverses ADR 0007's federal-only grant.
2. (Optional) **Dashboard as `(board)` route group** — if not already covered by the
   ADR-0005 follow-ups, record the route-group layout-gate enforcement choice.

## 12. PR sequencing (one module/surface per PR — CLAUDE.md §4)

1. Delegation model + migration + ADR + tests (members/auth) — no UI.
2. `dashboard-shell`: route group, sidebar, scope-switcher, scope landing, gates.
3. Federal overview + members table (+ member read methods) — the table template.
4. Federal events / groups / files (reuse table).
5. Roles surfaces (federal appoint + local vorstand) — `/security-review`.
6. Local scope: overview, members, events, profile, files.
