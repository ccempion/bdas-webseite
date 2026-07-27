# Membership application lifecycle — design

**Date:** 2026-07-27
**Status:** Approved, not yet implemented
**Related:** ADR 0021 (join decisions belong to the local board), ADR 0022 (group
transfers are requests), ADR 0031 (this design's decision record)

## Problem

A person who is not accepted into a group ends up in an incoherent state.

Rejection is `transitionStatus(pending → inactive)`. That single status flip
produces every defect below:

- **No reason is captured.** A status enum holds no data, so the board cannot say
  why, and the decline email is deliberately generic.
- **The rejected person stays in the group's member list.** Their
  `primary_group_id` still points at the group that rejected them.
- **They see nothing.** `/account` renders a status alert for `pending` and for
  `active` only. `STATUS_LABEL["inactive"]` is defined at
  `apps/web/app/account/page.tsx:26` and never read, so a rejected person logs in
  to an ordinary-looking account page with an editable profile form and no
  indication anything happened.
- **They cannot re-apply.** `inactive` transitions only to `active`
  (`modules/members/src/roles.ts:118`), and `changePrimaryGroup` rejects any
  member who is not `pending` or `active`
  (`modules/members/src/services/group-change.ts:146`), so they cannot even move
  to a different group and try there.
- **Boards have no review surface.** The applicant's profile — course of study,
  university, referral — is never shown to the board deciding on them.

### Root cause

`members.primary_group_id` is written when the applicant picks a group in the
profile wizard, before any board has agreed. The column claims "this person
belongs to this group" while meaning "this person would like to". Rejection then
has nothing clean to undo, and no place to put a reason.

## The governing rule

> `members.primary_group_id` is non-null **if and only if** a board has accepted
> that person into that group.

Everything in this design follows from restoring that invariant.

An application therefore cannot live on the member row. It becomes a row in
`member_group_change_requests` from `NULL → group`, which the table already
supports: `from_group_id` is nullable, and `listIncomingGroupChanges` already
hydrates applicants who are not yet members of the destination group — it was
built for exactly this shape.

## Decisions

| Question | Decision |
| --- | --- |
| Simultaneous applications | One open application at a time. To try elsewhere, withdraw first. |
| Rejection reason | Required category plus optional free-text message. **Both shown to the applicant.** No field is presented as private. |
| Re-applying to the same group | Allowed, with no cooldown. The board sees prior attempts and their outcomes. |
| Board invitations from the pool | **Not built.** Applications are the only direction. |
| Pool visibility | **Federal board only**, and limited to name, university, waiting time. |
| Full profile visibility | Only to the board of a group the person has actually applied to. |
| Leaving a group | Returns the person to the pool, where they may apply again. |

### Why no invitations

An invitation commits a group to accepting someone. Under ADR 0021 only that
group's own board may make that commitment, so the federal board cannot issue one
on a local group's behalf. Restricting the pool to the federal board — the
correct privacy call, since a groupless person should not be browsable by two
dozen local boards — leaves invitations with no one able to issue them. They are
dropped rather than bent.

The federal board's view of the pool is oversight: how many people are registered
with no group, and how long they have waited.

## Data model

### `member_group_change_requests` — two new columns

```sql
ALTER TABLE member_group_change_requests
  ADD COLUMN reason_category text,
  ADD COLUMN reason_message  text;
```

Both are null except on `status = 'rejected'`, where `reason_category` is
required and `reason_message` is optional. They apply to transfer rejections as
well as application rejections — the reason gap was never specific to joins.

No rename: `NULL → group` genuinely is a group change, and the existing unique
index `member_group_change_requests_open_uq` (one `pending` row per member)
already enforces one open application at a time.

`reason_category` is one of a fixed set, stored as a stable key and rendered in
German at the edge:

| Key | Label |
| --- | --- |
| `group_full` | Gruppe ist bereits voll |
| `incomplete` | Bewerbung unvollständig |
| `no_contact` | Kein Kontakt zustande gekommen |
| `not_a_fit` | Passt nicht zur Gruppe |
| `other` | Sonstiges |

When the category is `other`, `reason_message` becomes required — otherwise the
applicant learns nothing.

### `members` — no schema change, corrected semantics

- `pending` — registered, never accepted anywhere. Always `primary_group_id IS NULL`.
- `active` — an accepted member. May still be groupless, having left a group.
- `inactive` — was a member, no longer. **No longer produced by rejection.**
- `alumnus` — unchanged.

Rejection does not touch `status`. The `pending → inactive` transition stays in
the table but now means only "deactivate an applicant account", reachable by the
federal board through the existing `canManageGroup(grants, null)` path.

### The pool

```
primary_group_id IS NULL AND status IN ('pending', 'active')
```

Two populations, distinguishable and both able to apply:

- `pending` — never accepted; acceptance stamps `joined_at`.
- `active` — a member between groups; acceptance leaves `joined_at` untouched.

`inactive` and `alumnus` are excluded — they are not looking.

Accepting therefore stamps `joined_at` only when it is still null, so an existing
member keeps their original joining date.

## Authorization

Unchanged in substance — the join decision already lives in the right predicate.

`decideGroupChange` gates on `canDecideJoinRequest(grants, toGroupId, hasLocalBoard)`:
the destination group's `local_board` / `local_board_lead`, with the federal
board as fallback only when that group has zero unrevoked board grants (ADR 0021).
Because an application is now a request, initial joins inherit this for free.

Per the events-authz lesson in `modules/events`, the app layer authorizes the
**destination** state on writes. Here the destination is `to_group_id` on the
request row, which is what the predicate already reads.

## Surfaces

### 1. Applicant — one page, status first

Route: **`/account`** — not a new page. The status blocks render **only when they
exist**, so one route serves a brand-new user (group list at the top, no status
furniture), someone waiting on a decision, and someone just rejected. A second
route would need redirects out of `/account` and would strand the profile form,
which a person rejected as `unvollständig` needs before re-applying.

`apps/web/app/anmelden/actions.ts` already redirects a `pending` member with an
incomplete profile to `/profil`; it gains no new case, since `/account` is
already where everyone else lands.

Order:

1. Heading — "Du hast noch keine Gruppe".
2. Rejection block, if the most recent decided request was rejected: group,
   date, category label, and the board's message.
3. Open application block, if one is pending: group, date filed, withdraw button.
4. Group list with an apply action per group, sourced from the existing public
   index at `apps/web/app/gruppen/page.tsx`.

`/profil` currently redirects anyone who is not `pending` back to `/account`.
That stays correct: the wizard is for profile completion only.

### 2. Local board — `Bewerbungen`

New nav item in `groupNav()` (`apps/web/app/(board)/nav.ts`), after `Mitglieder`,
with a count badge. `nav.ts` already anticipates it: its header comment lists
`group-change` among pages "intentionally absent — PR 3+".

Route `/gruppe/[slug]/bewerbungen`, backed by `listIncomingGroupChanges`, which
already returns the request hydrated with the member and a `canDecide` flag.

One card per application, showing the full profile inline so the board decides
without navigating away:

- name, photo, university, course of study, degree type, date of birth
- how they found BDAS, and who referred them
- date applied
- **prior attempts**: attempt number, date and category of each earlier
  rejection by this group, from `getGroupChangeHistory`
- a `Mitglied ohne Gruppe` badge when the applicant is an existing member
- actions: `Aufnehmen`, and `Ablehnen …` opening the reason dialog

The reason dialog carries a required category select, an optional message
textarea, and an explicit line stating that both are visible to the applicant.

There is **no pool tab here.** A local board sees only people who applied to
its own group.

**Federal access to this page.** ADR 0021 gives the federal board the decision
when a group has no active board seat, and this page is where that happens: the
federal board already holds every active group in its scope switcher
(`boardScopes`), so it navigates to that group's `Bewerbungen` and decides there.
`listIncomingGroupChanges` admits the federal board, and `canDecide` comes back
false for a group that does have a board — visibility without authority, exactly
as ADR 0021 specifies. No separate federal decision surface is built, which is
what makes `apps/web/app/admin/pending-members/` removable.

### 3. Federal board — `Ohne Gruppe`

New nav item in `FEDERAL_NAV`, route `/federal/pool`. A read-only table of the
pool: name, university, waiting time, and whether the person is an applicant or a
member between groups. No date of birth, no photo, no actions.

This is the table the brief asked for — "where all the groupless people are" —
scoped to the only role with a federation-wide remit.

## Notifications

| Trigger | Template | Recipient | Change |
| --- | --- | --- | --- |
| `members.group_change.requested` | `member_application_received` | destination board | **Moved** from `profile.completed` |
| `members.group_change.decided` (approved) | `member_application_approved` | applicant | Moved from `members.status.changed` |
| `members.group_change.decided` (rejected) | `member_application_declined` | applicant | Moved, and **must now carry category + message** |

The move is forced: `member_application_received` fires today on
`profile.completed`, which routes by the group the wizard collected. Once the
wizard stops asking for a group, that trigger has no group to route to. Filing
the application is the correct moment anyway.

The `profile.completed` subscriber in `modules/notifications/src/subscribers.ts`
loses its board-notification branch. The `members.status.changed` subscriber
loses its `from === "pending"` branch entirely.

## Deletions

This design removes a parallel mechanism rather than adding a second one.

- The `from === "pending"` branch in `transitionStatus`
  (`modules/members/src/services/status.ts`) — pending members now always have
  `primary_group_id IS NULL`, so it can never fire.
- The `status === "pending"` straight-through write in `changePrimaryGroup` —
  everyone files a request. Leaving (`toGroupId === null`) still applies
  immediately and stays logged.
- `approveMember` in `status.ts`, and `rejectMemberAction` / `approveMemberAction`
  in `apps/web/app/(board)/_components/member-actions.ts`.
- The approve/reject buttons and the `Ausstehend` filter chip in `MembersTable.tsx`.
- `apps/web/app/admin/pending-members/` — superseded by the per-group queue.
- The group `<select>` in the profile wizard (`apps/web/app/profil/Wizard.tsx`
  and the `changePrimaryGroup` call in `apps/web/app/profil/actions.ts`).
- `STATUS_LABEL["inactive"]` and `["pending"]` in `apps/web/app/account/page.tsx`,
  replaced by the new status blocks.

## Data migration

`modules/members/migrations/0008_application_reasons.sql`, registered in
`infra/migrations/manifest.ts` — the runner uses the manifest, never a directory
walk.

1. Add the two reason columns.
2. For every `members` row with `status = 'pending'` and `primary_group_id IS NOT NULL`,
   insert a `pending` request `NULL → primary_group_id` stamped with the member's
   `created_at`, then null the column. Live applications keep their place in the
   queue.
3. For every `members` row with `status = 'inactive' AND joined_at IS NULL` —
   a rejected applicant, never a member, since `joined_at` is stamped only on
   first acceptance — set `status = 'pending'`, null `primary_group_id`, and
   insert a `rejected` request row recording the group and
   `reason_category = 'other'` with a message noting the reason predates this
   change. These people are currently stranded; this returns them to the pool.
4. Genuine former members (`inactive` with a non-null `joined_at`) are untouched.

Step 3 changes live people's state and was explicitly approved.

**Deployment:** Vercel does not run the migration runner on deploy. This
migration must be applied to production by hand and recorded in
`_bdas_migrations`, or every page reading the new columns breaks with "column
does not exist".

## Testing

Integration tests against Docker Postgres with per-test schema reset; no database
mocks.

**`modules/members`**

- An application is a `NULL → group` request; the member's group stays null while pending.
- The open-request unique index rejects a second application.
- Approval sets the group, stamps `joined_at` when null, and leaves it when set.
- Rejection writes category and message, leaves `status` and `primary_group_id` untouched, and lets the person immediately apply elsewhere — and to the same group again.
- `reason_category = 'other'` without a message is rejected.
- ADR 0021 holds: a foreign local board gets `FORBIDDEN`; the federal board is refused on a boarded group and allowed on a boardless one.
- The pool query excludes `inactive` and `alumnus`.
- `getGroupChangeHistory` returns prior rejections for the repeat-application badge.

**Migration** — a fixture with all four member shapes, asserting each lands correctly and no member ends up with a group nobody approved.

**End-to-end** — the existing `e2e/` acceptance job covers §23 flows; extend it with apply → reject-with-reason → see the reason → apply elsewhere → accepted.

## Slicing

Three reviewable PRs. Ordered so each one compiles and ships on its own — the
deletions come last, because removing `approveMember` while the board UI still
calls it would break the build.

1. **Module, additive.** The two columns, the migration, reason handling in
   `decideGroupChange`, the pool query, and tests. The old status-based join path
   stays in place and keeps working. Nothing user-visible.
2. **Board.** The `Bewerbungen` page and reason dialog, the federal pool page,
   both nav entries, and the notification rewiring. Ends by deleting the
   approve/reject buttons, the `Ausstehend` chip, `member-actions.ts`, and
   `admin/pending-members/`, all of which this PR has just replaced.
3. **Applicant, and the last deletions.** Status blocks on `/account`, the apply
   action on the group list, removal of the wizard's group picker, and — once
   nothing calls them — the `pending` branches in `transitionStatus` and
   `changePrimaryGroup`.

`MemberGroupPanel` and `group-history.ts` survive all three: they render an
existing member's outbound transfer, and `buildGroupTimeline` is what the
repeat-application badge in PR 2 reuses.

## Out of scope

- Board invitations, and any pool visibility for local boards.
- Cooldowns or bars on repeat applications.
- A motivation letter or any application-specific free text from the applicant.
- Structured analytics over rejection categories. The data will support it; no report is built.
- Any change to `alumnus` handling.
