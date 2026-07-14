# ADR 0017 — `event_organizer` is group-scoped, not event-scoped

- **Status:** Accepted
- **Date:** 2026-06-27
- **Supersedes:** the "Organizer delegation" locked row of the approved design
  `docs/superpowers/specs/2026-06-26-event-pages-design.md` (Slice 3).
- **Builds on:** ADR 0007 (scoped role grants), ADR 0013 (`local_board_lead`).

## Context

The approved event-pages design specified a delegable `event_organizer` role
**scoped to a single event** (`event_organizer:<event_id>`), with a permission
boundary that kept cancel/delete and co-organizer grants board-only. Two
problems surfaced when planning Slice 3:

1. The existing grant machinery (`member_role_grants`) scopes by `group_id`, and
   the role domain lives in `auth.Role`. An event id has no home there without a
   generalized scope column or storing event ids in the `group_id` column —
   both awkward. `members` also cannot resolve event→group (rule 2), so a
   per-event grant could not be authorized inside `members.grantRole`.
2. The federation decided it wants a person who can **always** organize a group's
   events, not a fresh delegation per event.

## Decision

`event_organizer` is **group-scoped** — a new value in `member_role_grants`
alongside `local_board`/`local_board_lead`, reusing the scope column, the
active-unique index, and the revoke/audit columns. No new table.

- A holder may run the **full lifecycle** of **any** event in the scoped group:
  create, edit, publish, cancel, delete, plus all roster/email/export actions.
  It confers **no** member-admin powers and **cannot** grant or revoke roles.
  Effectively "`local_board` restricted to the events surface."
- **Granting/revoking** `event_organizer` follows the ADR 0013 `local_board`
  rule: **federal board, or a `local_board_lead` of that group**. A plain
  `local_board` grant does not confer it.
- Grant/revoke reuse the existing `members.role.granted` / `members.role.revoked`
  bus events; `notifications` sends a welcome email on grant and a removal email
  on revoke. The events-module `organizer.granted` event from the parent spec is
  **not** built — the grant lives in `members`, so its role event is the source.

The role domain widens in the three synced places ADR 0013 established: the
`Role` union (`auth`), `ALL_ROLES`/`isRole` (`members`), and the
`member_role_grants_role_check` constraint (new migration
`members/0005_event_organizer.sql`). Like `local_board_lead`, it is never set at
login — JWT still attaches only `federal_board`.

Authorization is two rules: managing an event widens `events.canManage` to
include the viewer's `organizerGroupIds`; granting the role reuses the
`canGrantLocalBoard` (federal-or-lead) check.

## Consequences

- A trusted non-board member can run a group's events end to end without member
  admin or role-granting power. Boards delegate operations without delegating
  governance.
- Because the holder can cancel/delete events, the role is higher-trust than the
  parent spec's event-scoped boundary implied; granting is therefore restricted
  to leads/federal, not any board member.
- No event-scoped grant infrastructure is needed; existing group-scoped grant,
  audit, and revoke paths are reused. The change is additive — existing grants
  are unaffected, no backfill.
- Slice 3 touches `members`, `events`, `apps/web` roles admin, and
  `notifications`; it gets `/security-review` per CLAUDE.md §4 (a new
  authorization role).
