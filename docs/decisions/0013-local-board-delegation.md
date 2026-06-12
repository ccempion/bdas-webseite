# ADR 0013 — Local board delegation (`local_board_lead`)

- **Status:** Accepted
- **Date:** 2026-06-11
- **Amends:** ADR 0007 — the clause "every grant hard-gates to `federal_board`".

## Context

ADR 0007 made `federal_board` the sole authority for every role grant. In
practice the federation wants local boards to manage their own membership: the
federal board should appoint one or more trusted members of a local board, who
then add/remove `local_board` within that group. Centralising every local board
change on the federal board does not match how the groups operate.

## Decision

Introduce a new group-scoped grant **`local_board_lead`**, stored as another
value in `member_role_grants` (no new table; the scope column, active-unique
index, and FK cascade are reused).

- Federal board appoints/revokes `local_board_lead` for a group. **Several
  co-leads per group are allowed** (no uniqueness constraint).
- A `local_board_lead` may grant/revoke **`local_board` for its own group only**.
- A lead may NOT appoint other leads, grant `federal_board`, or act on another
  group. Federal board remains a superset and may grant any role directly.

Authorization lives in one chokepoint, `requireCanGrant` in
`modules/members/src/services/roles.ts`. The role domain widens in three places
kept in sync: the `Role` union (`auth`), `ALL_ROLES`/`isRole` (`members`), and
the `member_role_grants_role_check` constraint (migration `0003`).

Leads are never set at login — the JWT allowlist still only grants
`federal_board`; lead authority flows from DB grants via `effectiveGrants`.

## Consequences

- Local boards self-manage their roster; the federal board controls only who the
  leads are. Existing grants are unaffected (the change is additive; no backfill).
- A new highest-trust appointment (`local_board_lead`) exists. The dashboard
  roles surfaces (`/federal/roles`, `/gruppe/[slug]/vorstand`) gate on it and get
  `/security-review` per CLAUDE.md §4.
- Reverses ADR 0007's "federal-only grant" rule; that ADR's table model stands.
