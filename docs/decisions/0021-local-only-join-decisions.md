# ADR 0021 — Join decisions belong to the local board

- **Status:** Accepted
- **Date:** 2026-07-13
- **Amends:** ADR 0007 — the clause "federal board is always unscoped and authorises every group", for the join decision only.

## Context

`transitionStatus` gated every member status change with a single
`canManageGroup` check, which short-circuits to `true` for `federal_board` on
any group. A federal board member could therefore approve — or reject — a
pending join request on behalf of a local group.

The federation does not want this. Whether a person joins a local group is the
local group's call: they know the applicant, they carry the consequences. A
federal board member deciding admission for a group they are not part of
overrides the group's own judgement. Federal oversight over the federation as a
whole is not in question; admission to a *local* group is.

## Decision

The **join decision** for a member whose `primary_group_id` is a real local
group belongs to that group's own board. "Join decision" means any transition
out of `pending` — both **accept** (`pending → active`) and **reject**
(`pending → inactive`). Splitting them would let federal block a join it cannot
grant.

- A `local_board` or `local_board_lead` **scoped to that group** may decide.
- `federal_board` may **not** decide, even though it manages the group for every
  other purpose.
- **Emergency fallback:** if the group has **zero active local-board seats**,
  `federal_board` regains the decision. Without this, a group with an empty board
  would strand its applicants in `pending` with nobody able to act.
- A pending member with **no group** (`primary_group_id IS NULL`) has no local
  board to speak for it and stays federal-only, via the existing
  `canManageGroup` path.

Every **other** transition (`active → inactive`, `active → alumnus`,
reactivation) keeps the existing `canManageGroup` gate, so federal board retains
deactivation and alumni authority over any member.

Authorization lives in one new pure predicate, `canDecideJoinRequest` in
`modules/members/src/roles.ts`, applied at the single chokepoint in
`transitionStatus` (`modules/members/src/services/status.ts`). The dead
`canApproveMember` — exported but never called — is removed in the same change.

### "Has a local board" is measured from grants

A group counts as boarded when a `local_board` or `local_board_lead` row exists
in `member_role_grants` for it with `revoked_at IS NULL` — regardless of whether
the holder is themselves `active`. This matches how `effectiveGrants` already
treats grants as authoritative and keeps the check to one indexed query
(`member_role_grants_group_idx`).

The consequence: a group whose only board member has gone inactive without
having their grant revoked still counts as boarded, so the federal fallback does
not open. The remedy is to revoke the grant, which is the correct bookkeeping
anyway. We prefer this over joining to `members.status` and inventing a second,
implicit definition of "is on the board".

## Consequences

- Federal board still **sees** every pending member (`listPendingMembers` is
  unchanged) but will get a `FORBIDDEN` if it acts on a boarded group's request.
  Visibility is oversight; the decision is not. The board UI does not yet hide
  the approve/reject buttons for this case — a follow-up, not a correctness gap,
  since the server is the enforcement point.
- Seeding a brand-new group still works: it has no board yet, so federal can
  approve the first members — including the ones it will then appoint as that
  group's board.
- A group can lock federal board out of its own admissions simply by having a
  board. That is the intent.
