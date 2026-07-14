# ADR 0022 — Group transfers are requests, decided by the destination board

**Status:** Accepted
**Date:** 2026-07-13
**Supersedes:** nothing. **Amends:** the members module's profile surface.

## Context

`updateProfile` accepted `primaryGroupId` and wrote it with no authorization and
no status change. The `/account` form exposed a `<select>` of every active group
in the federation, so any member could reassign themselves to any group in one
POST: no approval, no re-entry into the pending queue, no notification to either
board. Because `modules/files/src/permissions.ts` grants folder access on
`status === "active" && primaryGroupId === folder.groupId`, this was a
self-serve path into another group's private documents.

## Decision

1. **A group change is a request, not an edit.** `member_group_change_requests`
   records every movement. Its rows _are_ the audit log — there is no second
   history table. A row's terminal state is `approved`, `rejected` or
   `withdrawn`; at most one `pending` row may exist per member (partial unique
   index).
2. **The destination group's board decides.** This mirrors ADR 0021: a join
   decision belongs to the group being joined. `canDecideJoinRequest` is reused
   verbatim against `to_group_id`, including its federal-board fallback for a
   destination group with zero active local-board seats. The origin group is
   _notified_ (the request is visible in its members list) but has no veto — a
   member cannot be held hostage by the group they are leaving.
3. **Approval auto-revokes group-scoped grants in the origin group.** Any active
   `local_board`, `local_board_lead` or `event_organizer` grant scoped to
   `from_group_id` is revoked in the same transaction, with the deciding user
   recorded as revoker and a `members.role.revoked` event per grant. Unscoped
   (federal) grants are untouched. Keeping board powers over a group you left is
   the same escalation class as the bug this ADR closes.
4. **Pending members still edit their group freely.** Nothing has been approved
   yet, so there is nothing to re-approve; their join request simply moves to the
   other group's queue.
5. **Leaving to no group applies immediately.** Nobody needs to approve an exit.
   It is still written to the log as an auto-approved row (`to_group_id NULL`)
   and it revokes origin-group grants like any other departure.
6. **Self-service only.** `changePrimaryGroup` requires `actor.userId` to equal
   the member's `user_id`. Board-initiated moves are out of scope; a board acts
   by deciding requests.

## Consequences

- `UpdateProfileInput` no longer carries `primaryGroupId`. `updateProfile` is a
  names-only service. Any future caller wanting to move a member must go through
  `changePrimaryGroup` (self) or `decideGroupChange` (board).
- `joinedAt` keeps its meaning: the date the member joined _the federation_, not
  their current group. The group timeline derives the initial join from it.
- The members module still performs no existence check on a destination group —
  the SQL foreign key backstops it. Querying `groups` from the members module
  would violate CLAUDE.md §1 rule 1.
