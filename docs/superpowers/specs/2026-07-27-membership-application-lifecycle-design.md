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
| Pool visibility | **Federal board only**, and limited to name, university, and how long they have been registered. |
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
with no group, and since when they have been registered.

That last value is registration time, **not** time spent without a group, and the
column is labelled "Im Verband seit" rather than "Wartet seit" for exactly that
reason. For someone who left a group after years of membership the two differ by
the whole membership. The truer value is computable — an exit is recorded as an
approved request with a null destination, carrying its decision date — but was
deliberately not built: the honest label was preferred to the extra query.

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
| `no_contact` | Kein Kontakt zustande gekommen |
| `not_a_student` | Kein Student mehr |
| `other` | Sonstiges |

Three, deliberately. Capacity and "not a fit" were considered and dropped: a
board that wants to say either can say it in the message, and a short list keeps
the dropdown honest rather than inviting a box-ticking rejection.

When the category is `other`, `reason_message` becomes required — otherwise the
applicant learns nothing.

### `members` — no schema change, corrected semantics

- `pending` — registered, never accepted anywhere. Always `primary_group_id IS NULL`.
- `active` — an accepted member. May still be groupless, having left a group.
- `inactive` — was a member, no longer. **No longer produced by rejection.**
- `alumnus` — unchanged, and unreachable; see the audit below.

Rejection does not touch `status`. The transition table is left exactly as it is,
but with rejection no longer using `pending → inactive`, no reachable caller of
`transitionStatus` remains. `inactive` and `alumnus` become states that only the
future member-lifecycle work will produce. The service is kept for it.

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

## State machine audit — no dead ends

The goal is that no person can reach a state they cannot leave. Every combination
of `status` × group × open request was walked; the findings below are design
requirements, not observations.

### Which group statuses may be applied to

`GroupStatus` is `active | dormant | new | archived`. **Applications may target
`active` and `dormant`; `new` and `archived` may not.** A dormant group keeps its
board's scope and switcher entry, so it can still decide, and an application is a
plausible way for a resting group to revive.

This widens today's behaviour, but **only on the apply surface**. The public
group index at `apps/web/app/gruppen/page.tsx` keeps its `active`-only filter —
the public website should not start advertising resting groups. The applicant's
group list is a separate query over `active | dormant`, with dormant entries
labelled **ruhend** so nobody applies to one unaware.

`new` is excluded, decided deliberately. It is inert in the codebase — nothing
branches on it, so it behaves exactly like `dormant` in every existing path — and
rather than lean on that accident, the status is left out of this design
entirely. A group being founded reaches applicants by being switched to `active`,
which is also what ADR 0021's seeding path assumes.

**The apply action must enforce this server-side.** `changePrimaryGroup`
deliberately does not read the `groups` table — that would violate CLAUDE.md §1
rule 1 — so the module structurally cannot validate the destination. The app
layer must authorize the **destination** state on write, exactly as in the events
authorization defect, or a crafted POST files an application against an archived
group id.

### Deadlock: a group archived with applications open

Applying to an archived group is impossible, but a group can be archived *while*
applications are open — and that is a hard lock:

- Nothing subscribes to `groups.group.archived`, so archiving does **not** revoke
  board grants. `groupHasActiveLocalBoard` therefore stays true, which keeps
  ADR 0021's federal fallback **closed**.
- `canSeeGroupScope` returns false for a local board on an archived group.

So the local board cannot open the page, and the federal board is not authorized
to decide. Nobody can. The applicant's only escape is withdrawing, which they
have no reason to know about.

**Requirement:** a subscriber on `groups.group.archived` closes every open
incoming request for that group as **`withdrawn`**, not `rejected`, and notifies
each applicant that the group was dissolved and they may apply elsewhere. Nobody
judged them, so nothing should say they were turned down. `withdrawn` already
exists in the status set and its meaning widens from "the member withdrew it" to
"it was closed without a decision"; no rejection category is involved, and
`reason_category` stays null. Event-driven rather than a call from `groups` into
`members`, per the module conventions.

`dormant` needs no handling: the local board keeps scope, and the federal
open-applications section below covers a dormant group with no board.

### Discovery gap: federal cannot navigate to a non-active group's queue

`boardScopes` puts only `active` groups in the federal switcher, while
`canSeeGroupScope` admits federal to any group. Federal can therefore reach such
a queue only by typing the URL. It matters in one narrow case: an `active` group
with no board goes `dormant` with an application open — the federal fallback is
open, but the queue is undiscoverable.

**Requirement:** the federal pool page carries a second section, **Offene
Bewerbungen (alle Gruppen)**, listing every undecided request with its group and
a link. `listOpenGroupChanges` already returns exactly this for the federal board,
with a `canDecide` flag per row. This closes the hole for every group status at
once and costs one query.

### An applicant deactivated mid-application

`transitionStatus(→ inactive)` would leave any open request `pending`, and a
board could then approve it and hand a group to a deactivated person.

**Not currently reachable** — as established below, `transitionStatus` has no
caller left once rejection stops using it, so nobody can be deactivated. The
scenario becomes live the moment member lifecycle is built.

**Requirement anyway:** `decideGroupChange` refuses a request whose member is no
longer `pending` or `active`. One guard clause, checked in the transaction that
already reads the member row, so it costs nothing — and it means the future
lifecycle work cannot reintroduce this hole by forgetting about it. The
corresponding withdraw-on-deactivation belongs to that future work, not here.

### `inactive` and `alumnus` are unreachable today

Verified against the code, and it changes what is worth building:

`transitionStatus` is called from exactly two places
(`apps/web/app/(board)/_components/member-actions.ts:41` and
`apps/web/app/admin/pending-members/actions.ts:47`), **both with `"inactive"`,
and both are the rejection path**. Nothing anywhere writes `"alumnus"`. The
approve/reject buttons in `MembersTable` render only for `pending` members, so
there is no way to deactivate an active member either.

So `active → inactive` and `active → alumnus` exist in the transition table with
no caller, and both states are reachable only by editing the database directly.
Readers honour them — `MembersTable` has an Alumni filter chip, blog access
grants alumni read rights, `roles.ts:44` grants an `alumnus` role — but no writer
produces them.

**Consequence for this design:** rejection stops producing `inactive`, which
removes the last reachable caller of `transitionStatus`. The service stays as the
members module's public surface for member lifecycle, with no app caller until
that lifecycle is built. It is not deleted, because reactivation will need it.

**Member lifecycle beyond joining — deactivation, alumni status, and the board
UI for both — is out of scope.** It was never implemented; this design neither
builds nor breaks it, and takes no position on how alumni should behave. That
question is deferred whole, to be answered when the lifecycle is actually built.

This design concerns applicants and active members only. `changePrimaryGroup`
keeps its existing `pending`/`active` gate unchanged.

### Cleared, requiring no change

- **No member row yet.** `createProfile` accepts `primaryGroupId ?? null`, so
  dropping the wizard's group picker cannot break member creation.
- **Withdrawal.** `withdrawGroupChange` and its `/account` button already exist
  and remain the escape from any pending application.
- **Transfer rejection.** An existing member refused by another group stays in
  their current one. They never become groupless by being rejected.
- **Board resigns mid-application.** Revoked grants open the federal fallback,
  which is exactly ADR 0021's design.
- **Migration and the unique index.** Today a `pending` member never has a
  request row, so step 2 inserts at most one per member and cannot violate
  `member_group_change_requests_open_uq`. The migration still guards with
  `NOT EXISTS` and the test asserts it.

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
   index at `apps/web/app/gruppen/page.tsx`, whose public `active`-only filter stays
   as is; this surface runs its own `active | dormant` query, with dormant
   groups labelled **ruhend** so nobody applies to one unaware. The apply server
   action re-validates that the destination is `active` or `dormant` before
   calling `changePrimaryGroup` — the module cannot check this itself.

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
- **prior attempts**: attempt number, date and **category only** of each earlier
  rejection by this group, from `getGroupChangeHistory`. The free-text message a
  previous board wrote is deliberately not surfaced here — it was written for the
  applicant, not as a dossier for the next board to read
- the deciding board member is **not** shown to the applicant anywhere.
  `decided_by` is recorded for audit, but a decision is the group's, not a named
  individual's, and naming one invites the applicant to take it up with them
  personally
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

New nav item in `FEDERAL_NAV`, route `/federal/pool`, with two sections.

**Ohne Gruppe** — a read-only table of the pool: name, university, registration date,
and whether the person is an applicant or a member between groups. No date of
birth, no photo, no actions. This is the table the brief asked for, "where all
the groupless people are", scoped to the only role with a federation-wide remit.

**Offene Bewerbungen (alle Gruppen)** — every undecided request in the
federation, with its destination group and a link to that group's queue, from
`listOpenGroupChanges` and its per-row `canDecide`. This exists to close the
discovery gap above: it is the only way the federal board can reach the queue of
a group that has left `active`, and it makes a request that nobody has acted on
visible rather than silently ageing.

## Notifications

| Trigger | Template | Recipient | Change |
| --- | --- | --- | --- |
| `members.group_change.requested` | `member_application_received` | destination board | **Moved** from `profile.completed` |
| `members.group_change.decided` (approved) | `member_application_approved` | applicant | Moved from `members.status.changed` |
| `members.group_change.decided` (rejected) | `member_application_declined` | applicant | Moved, and **must now carry category + message** |
| `groups.group.archived` | `member_application_group_dissolved` (**new template**) | each open applicant | **New subscriber**: closes the group's open requests as `withdrawn`. Not a rejection, so not the decline template — it says the group was dissolved and invites them to apply elsewhere |

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

### The reason-required constraint ships separately

"A rejection must carry a reason" is a constraint the *currently deployed* code
cannot satisfy — `decideGroupChange` does not set one yet. Enforcing it in `0008`
would make every rejection in the live app fail with a constraint violation from
the moment the migration lands until the new code deploys, and since migrations
here are applied by hand and decoupled from deploys, that window is however long
sits between two manual steps.

So `0008` carries the columns, the backfill, and only the constraints a NULL
category already satisfies. A second migration,
`0009_reason_required.sql`, carries the presence constraint alone.

This was caught in review, after an earlier draft of this spec had `0008` doing
both and instructed "migrate first, then deploy" — which is exactly backwards for
a constraint the running code cannot meet.

**Deployment is three ordered steps.** Vercel does not run the migration runner
on deploy; each step is manual and needs its own `_bdas_migrations` row.

1. Apply `0008`. Safe against the running code.
2. Deploy the code that always writes a reason on rejection.
3. Apply `0009`. Only now can it be satisfied.

**No feature flag.** CLAUDE.md §3 requires a flag per new *module*; this changes
an existing one, and the migration is a one-way data change that a flag could not
undo — a half-flipped flag would leave applications in one model and decisions in
another. The expand/contract ordering above is what provides the safety instead,
and it is the reason the constraint is a separate file rather than a comment
telling the operator to hurry.

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

**Deadlock coverage** — one test per finding above, each asserting the person can still move:

- Archiving a group closes its open applications as `withdrawn` with a null `reason_category`, and the applicant can immediately apply elsewhere.
- The apply action accepts an `active` and a `dormant` destination and refuses a `new` or `archived` one, including when the group id is supplied directly rather than chosen from the list.
- An application to a dormant group is decidable by that group's board.
- `decideGroupChange` refuses a request whose member is no longer `pending` or `active`.
- A member who leaves a group lands in the pool and can apply again in the same session.
- A rejected applicant can re-apply to the group that rejected them, and the board sees the prior attempt.

**Migration** — a fixture with all four member shapes, asserting each lands correctly and no member ends up with a group nobody approved.

**End-to-end** — the existing `e2e/` acceptance job covers §23 flows; extend it with apply → reject-with-reason → see the reason → apply elsewhere → accepted.

## Slicing

Three reviewable PRs. Ordered so each one compiles and ships on its own — the
deletions come last, because removing `approveMember` while the board UI still
calls it would break the build.

1. **Module, additive.** The two columns, the migration, reason handling in
   `decideGroupChange`, the pool query, the `groups.group.archived` subscriber,
   the member-status guard in
   `decideGroupChange`, and tests. The old status-based join path stays in place
   and keeps working. Nothing user-visible.
2. **Board.** The `Bewerbungen` page and reason dialog, the federal pool page
   with both of its sections, both nav entries, and the notification rewiring.
   Ends by deleting the approve/reject buttons, the `Ausstehend` chip,
   `member-actions.ts`, and `admin/pending-members/`, all of which this PR has
   just replaced.
3. **Applicant, and the last deletions.** Status blocks on `/account`, the apply
   action with its `active`-group validation, removal of the wizard's group
   picker, and — once nothing calls them — the `pending` branches in
   `transitionStatus` and `changePrimaryGroup`.

`MemberGroupPanel` and `group-history.ts` survive all three: they render an
existing member's outbound transfer, and `buildGroupTimeline` is what the
repeat-application badge in PR 2 reuses.

## Out of scope

- Board invitations, and any pool visibility for local boards.
- Cooldowns or bars on repeat applications.
- A motivation letter or any application-specific free text from the applicant.
- Structured analytics over rejection categories. The data will support it; no report is built.
- **Alumni, entirely.** The status is unreachable and this design takes no position on it.
- **Groups with status `new`.** Not applicable to, and given no meaning here. A founding group becomes reachable by being switched to `active`.
- **Member lifecycle after joining** — deactivation, alumni, and any board UI for them. Never implemented; `transitionStatus` remains the service it would use.
- **Retention and deletion of applicant data.** Someone never accepted stays in the pool indefinitely, with date of birth and photo. A deletion or anonymisation rule is needed under the General Data Protection Regulation (GDPR / DSGVO) but is explicitly deferred, not solved here.
