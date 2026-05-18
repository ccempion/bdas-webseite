# ADR 0007 — Scoped role grants (`member_role_grants`)

- **Status:** Accepted
- **Date:** 2026-05-18
- **Supersedes:** —
- **Superseded by:** —

## Context

Phase-1 acceptance criterion §23 #4 — _"a local board member can edit their
own group's profile and approve a pending member"_ — is currently unbuildable.

The `members` module was scaffolded (Sprint 3) with an unscoped
`members.roles text[]` column. Every privileged service
(`transitionStatus`, `approveMember`, `grantRole`, `revokeRole`) hard-gates
to `federal_board`, and all admin pages call `requireFederalBoard`. There is
no way to express "`local_board` **of a specific group**", so a local board
member cannot be authorized to act on their own group without also being able
to act on every group.

This is not an open product question. The spec already dictates the model:

- §5 line 66: _"A user holds **one base role** plus any number of **scoped
  role grants** (e.g. user X is Member with role grant
  `local_board:moenchengladbach`)."_
- §8 lists `member_role_grants` among the tables the `members` module owns,
  sketched as `id, member_id, scope (e.g. 'federal_board' |
'local_board:moenchengladbach'), granted_at, granted_by, revoked_at`.

The `text[]` column was a deliberate Sprint-3 shortcut, flagged for repayment
in `docs/result_sprint5.md`. This ADR records how the spec's already-decided
scoped-grant model is implemented and the design choices the spec leaves open.

## Decision

Replace `members.roles text[]` with a `member_role_grants` table owned by the
`members` module (CLAUDE.md §1 rule 1).

### 1. Normalized columns, not a stringly `scope`

The spec sketches `scope` as a single string (`'local_board:moenchengladbach'`).
We store it normalized instead:

```
member_role_grants
  id          text primary key
  member_id   text not null  fk -> members(id) on delete cascade
  role        text not null            -- 'federal_board' | 'local_board' | ...
  group_id    text          fk -> groups(id) on delete cascade   -- NULL = unscoped
  granted_at  timestamptz not null default now()
  granted_by  text not null            -- auth user id of the granting actor
  revoked_at  timestamptz              -- NULL = active
```

- `group_id IS NULL` ⇔ an unscoped grant (`federal_board`).
- `group_id` set ⇔ scoped (`local_board` of that group).
- Partial unique index on `(member_id, role, group_id) WHERE revoked_at IS NULL`
  so a member cannot hold the same active grant twice.

This is a **deliberate, documented deviation** from the spec's literal string
sketch (CLAUDE.md §8 — ADRs win on conflicts). The intent is identical; the
normalized form buys a real FK to `groups`, referential integrity on group
deletion, and a DB-enforced uniqueness invariant, none of which a parsed
`'local_board:<slug>'` string provides. The scope key is the stable
`group_id`, not the slug; the spec's `:moenchengladbach` is illustrative.

### 2. Scoped grants resolve from the DB, never the JWT

ADR 0002 fixes the SSO JWT shape: HS256, 7-day fixed expiry, no refresh, and
coarse base `roles`. Scoped grants are **not** added to the JWT. They are
read from `member_role_grants` at request time.

- ADR 0002 and the `wp-plugin/bdas-sso` verifier are **untouched** → no
  session re-issue, no plugin update. This is the exact "SSO cookie is the
  load-bearing wall" risk called out in the build plan §5; not reopening it.
- A revoked `local_board` grant takes effect on the next request, not in up
  to 7 days.
- `getCurrentMember` already performs a `members` DB read; resolving grants
  there adds no round trip.

The JWT continues to carry coarse base roles for the WordPress plugin, which
only needs "logged in vs not" in Phase 1.

### 3. Authorization model

The members module exposes a grant shape and predicates; callers stop
inspecting a raw role-string array:

```
type Grant = { role: Role; groupId: string | null }

isFederalBoard(grants)              -> boolean
canManageGroup(grants, groupId)     -> federal_board OR local_board:groupId
canApproveMember(grants, member)    -> canManageGroup(grants, member.primaryGroupId)
```

`Actor` carries `grants: Grant[]` instead of `effectiveRoles: string[]`.
`effectiveGrants(jwtRoles, member, dbGrants)` replaces `effectiveRoles()`:
JWT base roles become unscoped grants, status still implies `member`/`alumnus`,
and DB rows contribute the scoped grants.

### 4. Grant/revoke privilege

Only an actor with `federal_board` may `grantRole`/`revokeRole` a
`local_board:<group>` grant (spec §5 line 63 — the federal board sets and
unsets the local board role). No self-service grants. The federal-only guard
on `grantRole`/`revokeRole` is retained; only its storage changes.

### 5. `groups` stays auth-agnostic

The `groups` module is **not** changed. Its services remain authorization-free
(CLAUDE.md §1 rule 2); the app layer gates `updateGroup`/`archiveGroup` using
the `members` predicates, exactly as the federal-board group UI already does.

### 6. Phase-1 UI: broaden the stopgap pages

`/admin/pending-members` and `/admin/gruppen/[slug]/bearbeiten` change their
gate from `requireFederalBoard` to the scoped predicates, and filter their
lists to the actor's groups. **No new routes.** The real board surface is the
Phase-3 dashboard app (build plan §4); these pages are stopgaps and Phase 3
replaces them, so investing in separate local-board routes now is throwaway
work.

## Alternatives considered

### Keep the literal `scope` string from the spec sketch

**Rejected** — no FK, no cascade on group deletion, no DB-level uniqueness;
every read parses `split(':')`. Same model, strictly weaker integrity. The
deviation is documented here per CLAUDE.md §8.

### Put scoped grants in the JWT

**Rejected** — forces an ADR-0002 JWT-shape change, a `wp-plugin` verifier
update, and re-issue of all live sessions, and makes a revoked local-board
grant linger for up to 7 days. Reopens the build-plan §5 load-bearing-wall
risk for no benefit, since the DB read already happens.

### Add separate `/lokal/*` routes for the local board in Phase 1

**Rejected** — more surface to build and then discard when the Phase-3
dashboard lands. The capability, not a bespoke UI, is what §23 #4 requires.

## Consequences

### Positive

- §23 #4 becomes buildable; authorization is group-scoped and least-privilege.
- Spec §8's `member_role_grants` table is realized with real referential
  integrity.
- ADR 0002 / SSO / WordPress plugin untouched — no session churn.
- Revocation is effective immediately.

### Negative

- Forward-only migration: `members.roles` is backfilled into
  `member_role_grants` as **unscoped** grants (pre-production data is
  local/CI only, nothing deployed — acceptable, cf. ADR 0006), then the
  column is dropped. The `members` public interface changes (`Actor`,
  `effectiveRoles` → `effectiveGrants`); all call sites move in the same PR.
- Spec §8's literal `scope`-string sketch now diverges from the
  implementation; this ADR is the source of truth in the interim.

## Follow-ups

- Amend spec §8's `member_role_grants` sketch to the normalized columns (or a
  pointer here) the next time the spec is revised.
- `group_change_requests` and "member retains source-group rights while a
  group change is pending" (spec §8) remain **Phase 6** — out of scope here.
- `member_status_history` (spec §8) is still deferred; not required for
  scoping.
- Per-group file scopes (`files` module, spec §13) will consume
  `canManageGroup`; out of scope until that module's phase.
