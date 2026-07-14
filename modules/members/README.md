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
3. A board user who manages the member's group (`federal_board`, or
   `local_board` of that group) opens `/admin/pending-members` → approves via
   `approveMember()` → status `active` and `joined_at` is stamped.
4. The active member can be promoted (`grantRole local_board <group>`,
   federal_board only) or transitioned to `inactive` / `alumnus` later.

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
  grantRole,
  revokeRole,
  // Authorization helpers
  effectiveGrants,
  isFederalBoard,
  canManageGroup,
  canApproveMember,
  canTransition,
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
(`federal_board`, status-implied `member`/`alumnus`); a set `groupId` ⇔ scoped
(`local_board` of that group).

`effectiveGrants(jwtRoles, member, dbGrants)` unions:

- JWT roles (env allowlist `federal_board` per ADR 0002) → unscoped grants,
- active `member_role_grants` rows → their stored scope,
- status-implied: `active → member`, `alumnus → alumnus` (unscoped).

This is `getCurrentMember(...).grants`. Authorize against it via the
predicates — never inspect a raw role list:

- `isFederalBoard(grants)` — holds an unscoped board grant.
- `canManageGroup(grants, groupId)` — federal_board (any) **or** `local_board`
  scoped to `groupId`.
- `canApproveMember(grants, member)` — `canManageGroup` of the member's
  primary group.
- `canGrantLocalBoard(grants, groupId)` — federal_board (any) **or**
  `local_board_lead` scoped to `groupId`.

Grants are resolved from the DB on every request, **not** carried in the JWT
(ADR 0007 §2) — a revoked grant takes effect immediately and ADR 0002 / the
WordPress SSO plugin are untouched.

`grantRole` / `revokeRole` (ADR 0007, amended by ADR 0013): `federal_board`
may grant any role. `local_board` grants require a `groupId`; `federal_board`
grants must be unscoped. `local_board_lead` (ADR 0013): federal board appoints
leads per group (several allowed); a lead grants/revokes `local_board` within
its own group only.

## Status transitions

```
pending → active | inactive
active  → inactive | alumnus
inactive → active
alumnus → active
```

Anything else throws `ConflictError`. All transitions require the actor to
manage the member's group (`canManageGroup`).

## Group transfers (ADR 0022)

`primary_group_id` is **not** editable through `updateProfile` — that service
takes names only. A member moves groups through `changePrimaryGroup`, which
branches on their status:

| Member is | Picks               | What happens                                                                                                   |
| --------- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pending` | any group           | written straight through — nothing was approved yet, so the join request just moves to the other group's queue |
| `active`  | another group       | a `pending` row in `member_group_change_requests`; the member does **not** move                                |
| `active`  | no group (exit)     | applied immediately (nobody approves an exit), logged as an auto-approved row                                  |
| any       | their current group | no-op, and any open request is withdrawn — the "never mind" affordance                                         |

An open request is superseded when the member picks a different group, and
withdrawn by `withdrawGroupChange`. At most one open request per member (partial
unique index).

`decideGroupChange` is the board's side. The **destination** group's board
decides — a `local_board`/`local_board_lead` scoped to `to_group_id` — with
federal board as fallback only when that group has no active board seat
(`canDecideJoinRequest`, ADR 0021). The origin group can see the request but has
no veto. Approval moves the member, leaves `status` untouched, and **revokes
every group-scoped grant they still held in the group they left** (emitting a
`members.role.revoked` per grant); rejection leaves them where they were.

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
