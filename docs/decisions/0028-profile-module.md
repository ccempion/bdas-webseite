# ADR 0028 — Extended member data lives in a `profile` module, not in `members`

**Status:** Accepted
**Date:** 2026-07-25
**Supersedes:** nothing. **Amends:** the registration flow (name persistence) and
the local board's pending-member screen.

Design spec: [`docs/superpowers/specs/2026-07-23-profile-data-design.md`](../superpowers/specs/2026-07-23-profile-data-design.md).
Issues: #52 (Profile Data), #96 (Änderung der Daten), #97 (wizard UX).

## Context

Applying for BDAS membership captured only an email, a password and a group
choice. The local board deciding `pending → active` had nothing to decide _on_:
no course of study, no university, no age, no idea how the applicant found the
federation. The board asked for that data, plus the ability for a member to
correct it later, plus an optional photo.

`members` already owns identity and the join lifecycle. Piling six more columns
onto it would have made that table the dumping ground for every future
per-member field, and would have put personal data (birth date, photo) under the
same read paths as the membership status every module already consults.

## Decision

1. **A new `modules/profile` owns `member_profiles`, keyed by `user_id`.**
   `members` is untouched. There is no cross-module FK — the two are joined by
   `user_id` at the app layer (`apps/web/app/_profile/complete.ts`), which is the
   only place that needs both. Rule 1 of the working agreement applies as
   written: nothing outside the module reads `member_profiles`.
2. **The board's decision does not move.** `approveMember` in `members` remains
   the sole `pending → active` transition. This module contributes _evidence_ to
   that decision and nothing else; completing a profile grants no status.
3. **`profile.completed` is an event, not a call.** The notifications module
   subscribes and mails the applicant's local board. `profile` never imports
   `notifications`; `members` gained `listBoardRecipientsForGroup` so the
   subscriber can resolve recipients without either module reaching into the
   other's tables.
4. **The referral is a signal, not a mechanism.** `gefundenDurch = "empfehlung"`
   plus a free-text `empfehlerName` is shown to the board. It creates no
   in-app vouch, no link between member rows, no automatic anything. A name
   typed by an applicant is not evidence of a relationship, and the board is
   already the decision-maker.
5. **Photos live in a private bucket.** `profile-media` is private; uploads go
   through `POST /api/profile/upload-url`, which mints a signed PUT for a key
   always prefixed with the caller's own user id (5 MB, image types only). Reads
   are short-lived signed download URLs minted server-side per render. There is
   no public URL and no byte-proxying route. Personal photos are not
   world-readable by accident of a bucket setting.
6. **Registration persists first and last name.** `registerAction` collected
   both and dropped them; the member row was created later, on the first
   `/account` submit. It now calls `createProfile` immediately after `register`,
   best-effort-logged like the verification email — an account is never blocked
   by a member-row hiccup. Consequence: a member row exists from sign-up
   onwards, so `/account`'s submit reads "Speichern" rather than "Profil
   einreichen".
7. **Onboarding is a wizard; corrections are a form.** `/profil` is a six-step
   wizard reached after email verification, for pending members only. Everyone
   else — including active members backfilling missing data — edits the same
   fields as a flat form on `/account` (#96). Both render the same field
   components and validate against the same zod schema; the wizard's per-step
   validation is a pure function over that schema, unit-tested without a browser.

## Consequences

- The `profile` feature flag gates the wizard, the API route, the `/account`
  section and the board's profile panel. With it off, the platform behaves
  exactly as it did before — except for decision 6, which is a bug fix and is
  deliberately not flag-gated.
- Enabling the flag in an environment requires the private `profile-media`
  bucket to exist (and `SUPABASE_PROFILE_MEDIA_BUCKET` if not the default).
  A missing or unreadable object degrades to "no image", never to an error page.
- Birth date and photo are personal data under the ADR 0008 posture: both are
  included in the `/account/datenexport` payload and cascade with the user.
- The E2E suite now runs with `BDAS_FLAG_PROFILE=true`, so the sign-in landing
  page depends on profile completeness. Shared helpers (`e2e/helpers/flows.ts`)
  accept either landing; the flag-off 404s stay covered by the route's unit test.

## Alternatives considered

- **Columns on `members`.** Rejected: it makes `members` the catch-all table and
  spreads personal data across every existing read path.
- **A public `profile-media` bucket with cached URLs.** Rejected: cheaper to
  render, but an unguessable public URL is still a public URL, and a member photo
  is not public information.
- **Auto-vouching from the referral field.** Rejected — see decision 4.
