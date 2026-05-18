# `@bdas/members`

Federation-side member profiles. Identity lives in `@bdas/auth`; membership
(name, primary group, status, scoped role grants) lives here.

## Owned tables

| Table                | Purpose                                                                              |
| -------------------- | ------------------------------------------------------------------------------------ |
| `members`            | id, user_id (FK auth_users), first/last name, primary_group_id, status, joined_at    |
| `member_role_grants` | id, member_id, role, group_id (FK groups, NULL=unscoped), granted/revoked (ADR 0007) |

`group_change_requests` and `member_status_history` deliberately omitted —
Phase 6 / deferred per spec.

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

Grants are resolved from the DB on every request, **not** carried in the JWT
(ADR 0007 §2) — a revoked grant takes effect immediately and ADR 0002 / the
WordPress SSO plugin are untouched.

`grantRole` / `revokeRole` are `federal_board`-only (the Bundesvorstand sets
and unsets the local board role). `local_board` grants require a `groupId`;
`federal_board` grants must be unscoped.

## Status transitions

```
pending → active | inactive
active  → inactive | alumnus
inactive → active
alumnus → active
```

Anything else throws `ConflictError`. All transitions require the actor to
manage the member's group (`canManageGroup`).

## Events

`members.profile.created`, `members.profile.updated`,
`members.status.changed`, `members.role.granted`, `members.role.revoked`
(the role events carry `groupId`). Subscribers depend on these types via
`MembersEvent`, never on the services.
