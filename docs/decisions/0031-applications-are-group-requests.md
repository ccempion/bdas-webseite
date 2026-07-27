# ADR 0031 — A membership application is a group request

**Status:** Accepted
**Date:** 2026-07-27
**Amends:** ADR 0021 (the join decision moves from `transitionStatus` to
`decideGroupChange`) and ADR 0022 (the request table gains rejection reasons and
absorbs initial joins). Supersedes neither.

## Context

The initial join and a group transfer were two different mechanisms. A transfer
was a row in `member_group_change_requests` decided by the destination board. A
join was `members.status` moving `pending → active | inactive`, decided by
`transitionStatus`.

The join mechanism rested on a broken invariant: the profile wizard wrote
`primary_group_id` when the applicant picked a group, before any board had
agreed. The column therefore meant "belongs to this group" for accepted members
and "would like to join this group" for applicants.

Every defect in the rejection path descends from that ambiguity. A rejected
person kept the group they were refused by, so they stayed in its member list. A
status flip carries no payload, so no reason could be recorded and the decline
email had to stay generic. `inactive` was a dead end — it transitions only to
`active` — and `changePrimaryGroup` refuses anyone not `pending` or `active`, so
a rejected person could neither re-apply nor move elsewhere. `/account` rendered
no alert at all for `inactive`, so they were not even told.

Boards were served no better: no surface showed an applicant's profile to the
board deciding on them.

## Decision

**`members.primary_group_id` is non-null if and only if a board has accepted that
person into that group.**

An application is consequently a `member_group_change_requests` row from
`NULL → group`, decided by `decideGroupChange` under the ADR 0021 predicate
`canDecideJoinRequest`. The table already permitted this shape:
`from_group_id` is nullable and `listIncomingGroupChanges` already hydrated
applicants who are not members of the destination group.

1. **Rejection records a reason.** Two new columns, `reason_category` (a fixed
   key, required on rejection) and `reason_message` (free text, optional, and
   required when the category is `other`). Both are shown to the applicant.
   Nothing is labelled private: a board's written reason is personal data about
   the applicant, disclosable under Article 15 of the General Data Protection
   Regulation, and this platform already ships a self-serve export. A field
   promising secrecy would be a promise the federation cannot keep. The columns
   cover transfer rejections too.

2. **Rejection does not change `status`.** The person stays `pending` with no
   group and may apply again immediately, to any group including the one that
   refused them. The deciding board sees prior attempts via
   `getGroupChangeHistory`, so repeat applications are handled with context
   rather than a cooldown.

3. **`status` recovers its meaning.** `pending` is "never accepted anywhere",
   `inactive` is "was a member, no longer". Leaving a group returns an `active`
   member to the same groupless pool.

4. **The groupless pool is federal-board only**, and exposes name, university and
   waiting time. The full profile is visible only to the board of a group the
   person has actually applied to, unlocked by the act of applying.

5. **No invitations.** An invitation commits a group to accepting someone, which
   under ADR 0021 only that group's board may do. With the pool restricted to the
   federal board, nobody who can see a candidate is entitled to make the offer.
   The direction is dropped rather than bent.

6. **No state may be unreachable from a way out.** Two consequences of this rule
   are load-bearing and are decided here rather than left to implementation:

   - **Archiving a group closes its open applications as `withdrawn`.** Nothing
     currently subscribes to `groups.group.archived`, so archiving does not
     revoke board grants; `groupHasActiveLocalBoard` stays true and holds
     ADR 0021's federal fallback shut, while `canSeeGroupScope` already locks the
     local board out of an archived group. Without this rule such an application
     is decidable by nobody. They are closed as `withdrawn` rather than
     `rejected`: no one judged the applicant, so nothing may tell them they were
     turned down. `reason_category` stays null and a separate template explains
     that the group was dissolved.
   - **Deactivation withdraws an open request**, and `decideGroupChange` refuses
     a request whose member is no longer `pending` or `active`, so no board can
     hand a group to a deactivated person.

   Applications may target `active` and `dormant` groups; only `archived` is
   excluded. A dormant group keeps its board's scope, so it can still decide, and
   an application is a plausible way for a resting group to revive.

## Scope

Applicants and active members only. `inactive` and `alumnus` are unreachable
today — `transitionStatus` is called from two places, both with `"inactive"`, and
both are the rejection path this ADR removes; nothing writes `"alumnus"` at all.
Member lifecycle after joining was never built, and this decision neither builds
nor breaks it. `transitionStatus` is kept as the service that lifecycle will use.

Retention of applicant data is likewise out of scope and unresolved: a person
never accepted stays in the pool indefinitely.

## Consequences

- `transitionStatus` loses its `from === "pending"` branch, and
  `changePrimaryGroup` its pending straight-through write. The join decision has
  exactly one implementation.
- The profile wizard stops collecting a group; applying is a separate, later act.
  The "new application" notification therefore moves from `profile.completed` to
  `members.group_change.requested` — `profile.completed` no longer knows a group.
- Existing data is migrated. Live `pending` members become pending request rows
  keeping their queue position. Rows with `status = 'inactive' AND joined_at IS NULL`
  are rejected applicants — `joined_at` is stamped only on first acceptance — and
  return to the pool as groupless `pending`, with a `rejected` request recording
  the group they were refused by. Former members are untouched.
- Federal board keeps ADR 0021's emergency fallback for a group with no board.
  Nothing else about who decides changes.
- Rejection reasons are stored as stable keys, so the federation can later count
  how many refusals are capacity rather than fit. No report is built now.
