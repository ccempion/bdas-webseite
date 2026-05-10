# `@bdas/members`

Federation-side member profiles. Identity lives in `@bdas/auth`; membership
(name, primary group, status, roles) lives here.

## Owned tables

| Table     | Purpose                                                                                  |
| --------- | ---------------------------------------------------------------------------------------- |
| `members` | id, user_id (FK auth_users), first/last name, primary_group_id, status, roles, joined_at |

`group_change_requests` deliberately omitted — Phase 6 per spec.

## Lifecycle

1. User registers + verifies through `@bdas/auth` (no member row yet).
2. User fills the `/account` form → `createProfile()` → status `pending`.
3. A `federal_board` user opens `/admin/pending-members` → approves via `approveMember()` → status `active` and `joined_at` is stamped.
4. The active member can be promoted (`grantRole local_board`) or transitioned to `inactive` / `alumnus` later.

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
  // Helpers
  effectiveRoles,
  canTransition,
  isRole,
  type CurrentMember,
  type Member,
  type MemberStatus,
  type MembersEvent,
} from "@bdas/members";
```

## Effective roles

`effectiveRoles(jwtRoles, member)` unions:

- JWT roles (today: env-allowlist `federal_board` per ADR 0002).
- DB roles on the member row (granted via `grantRole`).
- Status-implied: `active → member`, `alumnus → alumnus`.

This is what `getCurrentMember(...).effectiveRoles` returns. App code
authorizes against this, not against `member.roles` alone.

## Status transitions

```
pending → active | inactive
active  → inactive | alumnus
inactive → active
alumnus → active
```

Anything else throws `ConflictError`. All transitions require
`federal_board` in the actor's effective roles.

## Events

`members.profile.created`, `members.profile.updated`,
`members.status.changed`, `members.role.granted`, `members.role.revoked`.
Subscribers depend on these types via `MembersEvent`, never on the services.
