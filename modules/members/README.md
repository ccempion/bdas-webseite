# `@bdas/members`

Federation-side member profiles. Identity lives in `@bdas/auth`; membership
(name, primary group, status, scoped role grants) lives here.

## Owned tables

| Table                          | Purpose                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `members`                      | id, user_id (FK auth_users), first/last name, primary_group_id, status, joined_at         |
| `member_role_grants`           | id, member_id, role, group_id (FK groups, NULL=unscoped), granted/revoked (ADR 0007)      |
| `member_group_change_requests` | id, member_id, from/to_group_id, status, requested/decided — queue **and** log (ADR 0022) |

`member_status_history` deliberately omitted — deferred per spec.

## Lifecycle

1. User registers + verifies through `@bdas/auth` (no member row yet).
2. User fills the `/account` form → `createProfile()` → status `pending`.
3. A board user who manages the member's group (`federal_board`, or the
   group's `local_board_lead`) opens `/admin/pending-members` → approves via
   `approveMember()` → status `active` and `joined_at` is stamped.
4. The active member can be promoted (`grantRole local_board_lead <group>`,
   federal_board only) or marked as alumnus later — a grant, not a status
   (ADR 0043).

A side door (ADR 0045): the federal board accepts a groupless former member
with `acceptAsAlumnus()` — status `active`, then the unscoped `alumnus` mark.

## Public surface

```ts
import {
  // Read
  getCurrentMember,
  requireFederalBoard,
  getMember,
  getMemberByUserId,
  listPendingMembers,
  // Write
  createProfile,
  updateProfile,
  transitionStatus,
  approveMember,
  acceptAsAlumnus,
  grantRole,
  revokeRole,
  // Authorization helpers
  effectiveGrants,
  isFederalBoard,
  canManageGroup,
  canApproveMember,
  canTransition,
  canEditGroupPage,
  isRole,
  type CurrentMember,
  type Member,
  type MemberStatus,
  type Grant,
  type MembersEvent,
} from "@bdas/members";
```

## Scoped role grants (ADR 0007)

A `Grant` is `{ role, groupId }`. `groupId === null` ⇔ unscoped
(`federal_board`, membership-implied `member`, an `alumnus` mark without a group); a
set `groupId` ⇔ scoped (`local_board_lead` of that group, one of its delegate
roles, or an `alumnus` mark issued by that group).

`effectiveGrants(jwtRoles, dbGrants, isMember)` unions:

- JWT roles (env allowlist `federal_board` per ADR 0002) → unscoped grants,
- active `member_role_grants` rows → their stored scope,
- membership-implied: `isMember → member` (unscoped, ADR 0045). `isMember`
  is `isBdasMemberFrom(...)` — accepted **and** (Hochschulgruppe **or**
  `alumnus` mark). An accepted Förderer account gets no `member` grant.

This is `getCurrentMember(...).grants`. Authorize against it via the
predicates — never inspect a raw role list:

- `isFederalBoard(grants)` — holds an unscoped board grant.
- `canManageGroup(grants, groupId)` — federal_board (any) **or** the group's
  Lead (`local_board_lead`). The local role redesign folded the old plain
  `local_board` role into Lead, so Lead is the sole local "manages this group"
  authority.
- `canApproveMember(grants, member)` — `canManageGroup` of the member's
  primary group.
- `canGrantLocalRoles(grants, groupId)` — federal_board (any) **or** the
  group's Lead. Governs granting the group's delegate roles: `event_organizer`,
  `page_editor`, `file_manager`, `blogger` — and the `alumnus` mark.
- `canEditGroupPage(grants, groupId)` — federal_board (any) **or**
  `local_board_lead`/`page_editor` scoped to `groupId` (ADR 0026). `page_editor`
  is a group-scoped, lead-delegable role for the group's public content page —
  granted/revoked the same way as `event_organizer` (ADR 0013/0017).

Grants are resolved from the DB on every request, **not** carried in the JWT
(ADR 0007 §2) — a revoked grant takes effect immediately and ADR 0002 / the
WordPress SSO plugin are untouched.

`grantRole` / `revokeRole` (ADR 0007, amended by ADR 0013 and the local role
redesign): `federal_board` may grant any role. `local_board_lead`,
`event_organizer`, `page_editor`, `file_manager`, and `blogger` grants require
a `groupId`; `federal_board` grants must be unscoped. `local_board_lead`
(ADR 0013): federal board appoints leads per group (several allowed); a lead
grants/revokes the group's delegate roles (`event_organizer`, `page_editor`,
`file_manager`, `blogger`) within its own group only — never another Lead, and
never `federal_board`.

`alumnus` (ADR 0043) is a mark, not a permission, and restricts nothing: an
alumnus stays `active`, keeps the `member` grant and with it event
registration. Only accepted (`active`) accounts can be marked — `grantRole`
throws `ValidationError` otherwise. It is optionally scoped. Scoped to a group, the group's Lead or
the federal board may set or remove it; unscoped, only the federal board
(`canManageGroup(grants, null)` passes federal only). A Lead may only mark
members of its own group. The mark survives an exit or a transfer with its
origin scope, so only the federal board can remove it afterwards;
`listAlumnusScopes` hands the UI every scope to revoke. Member lists, the
transfer pool (`listAlumnusIds`) and the statistics all derive the mark from the
grant, never from the status.

`CurrentMember.hasGroupScope` is the only place that answers whether an account
has a Hochschulgruppe scope: true exactly when the primary group's `kind` is
`hochschulgruppe` (read via `getGroupKind` from `@bdas/groups`), false without
a group. `CurrentMember.primaryGroupKind` carries the kind itself.

`CurrentMember.isBdasMember` is the only place that answers whether an account
is a BDAS member (ADR 0045): `active` **and** (Hochschulgruppe **or** an active
`alumnus` mark). It drives the unscoped `member` grant, and
`countMembersByStatus().active` counts by the same rule. A Förderer in a
`netzwerk` group is `active` but not a member. New internal features check
`isBdasMember` or the `member` grant — never `status === "active"`.

`grantRole` refuses `local_board_lead` on any other kind — even for
the federal board — because a group without a Lead escalates its join
decisions to the federal board (ADR 0021); `revokeRole` deliberately does not
check.

## Status transitions

```
pending → active
```

`MemberStatus` is `pending | active` and describes only the account lifecycle
(ADR 0043); `members_status_check` enforces it in the database. Anything else
throws `ConflictError`. The transition requires the actor to manage the
member's group (`canManageGroup`).

## Group transfers (ADR 0022)

`primary_group_id` is **not** editable through `updateProfile` — that service
takes names only. A member moves groups through `changePrimaryGroup`, which
branches on their status:

| Member is | Picks               | What happens                                                                                                    |
| --------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pending` | any group           | written straight through — nothing was approved yet, so the join request just moves to the other group's queue  |
| `active`  | another group       | a `pending` row in `member_group_change_requests`; the member does **not** move                                 |
| `active`  | no group (exit)     | applied immediately (nobody approves an exit), logged as an auto-approved row                                   |
| any       | their current group | no-op, and any open request is withdrawn — the "never mind" affordance                                          |
| any       | a `netzwerk` group  | applied immediately and `status` set to `active`, logged as an auto-approved row, no `decided` event (ADR 0045) |

Joining a `netzwerk` group is the one self-service join: that group has no
board, and nobody is meant to decide on a Förderer account. It does not make
the account a member (`isBdasMember`). The app only lets people pick a
Hochschulgruppe themselves (`apps/web/lib/self-service-group.ts`) until the
triage wizard brings an entry point for Förderer.

`listIncomingGroupChanges` carries `memberIsBdasMember` per applicant, so the
destination board can tell a member's transfer from a Förderer's application.

An open request is superseded when the member picks a different group, and
withdrawn by `withdrawGroupChange`. At most one open request per member (partial
unique index).

`decideGroupChange` is the board's side. The **destination** group's board
decides — its Lead (`local_board_lead`) scoped to `to_group_id` — with
federal board as fallback only when that group has no active board seat
(`canDecideJoinRequest`, ADR 0021). The origin group can see the request but has
no veto. Approval moves the member, leaves `status` untouched, and **revokes
every group-scoped grant they still held in the group they left** (emitting a
`members.role.revoked` per grant) — except `alumnus`, whose scope records where
the mark came from (ADR 0043); rejection leaves them where they were.

The table doubles as the audit log: terminal rows (`approved` / `rejected` /
`withdrawn`) are the history, read back via `getGroupChangeHistory`. There is no
separate audit table. `joinedAt` keeps its meaning — the date the member joined
the _federation_, not their current group.

### Reading the queue

| Service                                          | Answers                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `getOpenGroupChange(db, memberId)`               | does this member have an open request?                                                                             |
| `listOpenGroupChanges(db, actor)`                | every open request touching a group the actor manages, in either direction (the `/account` and federal-wide views) |
| `listIncomingGroupChanges(db, toGroupId, actor)` | one group's **inbound** queue, hydrated with the applicant                                                         |
| `getGroupChangeHistory(db, memberId, actor)`     | one member's full movement timeline                                                                                |

`listIncomingGroupChanges` exists because an applicant is still a member of the
group they are leaving: `listMembers({ groupId })` matches on `primary_group_id`
and so never returns them. Without the join to `members`, the destination board
would hold a request it is authorized to decide with no name attached to it.

## Events

`members.profile.created`, `members.profile.updated`,
`members.status.changed`, `members.role.granted`, `members.role.revoked`
(the role events carry `groupId`), `members.group_change.requested`,
`members.group_change.decided`, `members.group_change.withdrawn`. Subscribers
depend on these types via `MembersEvent`, never on the services.
