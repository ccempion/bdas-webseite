# ADR 0044 — The federal board may delete profileless applicants from "Ohne Gruppe"

**Status:** Accepted
**Date:** 2026-09-15
**Affects:** `modules/auth`, `modules/newsletter`, `/federal/pool`
**Partially brings forward:** ADR 0008 (account deletion deferred to Phase 6)

## Context

Bots register. Registration creates the `auth_users` row and, straight away,
a `members` row (`pending`, no group) — before the address is even verified.
So every bot lands in the federal board's "Ohne Gruppe" list as a
"Bewerber:in", and there is no way to get rid of it.

Full account deletion (spec §20: cascade to every module within 30 days) is
deferred to Phase 6 by ADR 0008, because a real member leaves traces that need
product decisions: uploaded files, event registrations, blog posts and
comments, FAQ submissions — several of them stored as plain user ids with no
FK that would clean up.

A bot leaves none of that. It never gets approved, never joins a group, and
never fills in the extended profile (`member_profiles`).

## Decision

- **The federal board can delete an account from the "Ohne Gruppe" list**
  when all of these hold, checked server-side at the moment of deletion:
  - its member row is `pending` (never approved) and has no primary group,
  - it has no extended profile,
  - it is not the acting board member,
  - its address is not on the federal-board allowlist.
- The list gets a filter "Ohne Profil" that narrows to exactly those rows.
  No separate list.
- **Mechanism:** `@bdas/auth` gains `deleteAccount(db, userId)`, which deletes
  the `auth_users` row and publishes `auth.user.deleted { userId, email }`.
  Within the database, the existing `ON DELETE CASCADE` FKs remove the
  credentials, sessions, tokens, the `members` row (with its grants and
  change requests) and a `member_profiles` row if one appeared.
  `@bdas/newsletter` subscribes to the event and deletes the account's
  subscriber rows by id _or_ address (ADR 0039), plus its prompt memory.
- The service is auth-agnostic. The eligibility rules live in the app-layer
  action, the only caller.

## Consequences

- This is **not** the GDPR deletion of ADR 0008. Members who were approved,
  are in a group or completed their profile cannot be deleted this way, and
  the Phase-6 work (grace period, what happens to content) is still open.
- Deletion is immediate and cannot be undone. There is no grace period — for
  a bot there is nothing to come back to.
- The eligibility check and the delete are two statements. An applicant who
  completes their profile in between is deleted anyway. Accepted: the
  window is milliseconds and the target group is accounts nobody uses.
- A plain-id reference (e.g. a blog comment by an applicant) would dangle.
  Applicants without a group are not expected to have any; if one appears,
  the rendering surface shows it as an unknown author.
