# @bdas/profile

Owns `member_profiles` — the federation's extended member data (course of
study, degree type, university, birth date, "found BDAS via", an optional
self-introduction, optional photo).
Keyed by `user_id`, which FKs `auth_users(id) ON DELETE CASCADE` so erasing an
identity erases the profile with it — this row holds personal data (birth date,
university, referral, private photo key), so it must not outlive its user. The
`members` module deliberately does **not** model these fields (platform spec
§1); this module is the home for them.

Public surface: `src/index.ts` only. Authorization (owner-only writes) lives in
the service. Emits `profile.completed` / `profile.updated` on the core bus.

## The Hochschule list

`data/hochschulen.tsv` is the HRK Hochschulkompass export of every recognised
German higher-education institution — 388 of them, transcoded to UTF-8 and
otherwise verbatim. It is the source; `src/universities.generated.ts` is built
from it by

```
node modules/profile/scripts/generate-universities.mjs
```

Edit the TSV and regenerate — never edit the generated file. The dropdown shows
the export's `Adressname der Hochschule` (the common short name, "RWTH Aachen")
rather than `Hochschulname` (the long legal one, "Rheinisch-Westfälische
Technische Hochschule Aachen").

`uni` is stored as free text, so the list is a convenience, not a constraint:
anything the list does not cover is typed in under "Sonstige". `canonicalUniversity`
maps a stored value back to its list entry and is the only thing that decides
list-vs-free-text in the edit form. It also resolves the 27 names the earlier
hand-curated list used, so profiles saved before the switch still show their
university as a selection instead of free text.

## The Studienfach list

`data/studienfaecher.csv` is the German subject classification — 265 subjects
under 11 categories (`Kategorie,Studienfach`), transcoded to UTF-8 without a BOM
and otherwise verbatim. `studiengang` itself stays free text.

The subject list is generated: `node modules/profile/scripts/generate-studienfaecher.mjs`
writes `src/studienfaecher.generated.ts` (`STUDIENFACH_KATEGORIEN`, 11 categories,
265 subjects). The form asks in two steps — category first, then subject within it.
The category is stored in `studienfach_kategorie`, not just used to filter: the
subject list will never be complete, so a subject it misses still lands in a known
category. Existing free-text `studiengang` values keep working; there is no
`canonicalStudienfach`.

## User types

`nutzertyp` (`student` | `alumnus` | `foerderer` | `bdaj`) decides which fields a
profile has (spec 2026-09-16 §4.3, `FIELD_SETS`). A CHECK in migration 0004
enforces the required columns per type; columns of other types are stored as
null. `saveProfile` takes the type from the submit, else from the stored row,
else `student` — the /account edit form sends none.

The /account edit form only knows the student fields. For the other three types
the page shows the summary without an edit button; editing their own fields there
is follow-up work to the onboarding wizard. `setProfilePhoto` sets the avatar for
every type.

Photos live in the **private** `profile-media` bucket (`core/storage`
`getProfileMediaStorage()`); the app mints short-lived signed URLs — never a
public URL, never proxied bytes.

The self-introduction (`vorstellung`) is optional for every "found via" channel
and verifies nothing — it exists so the board has the applicant's own words when
there is no recommender to recognise (#122). Nothing gates on it; an empty one is
never grounds for rejection. Consistent with ADR 0029 decision 4: self-typed
input is a signal, not proof.

Completing a profile grants no membership status: `members.approveMember` stays
the sole `pending → active` decision. This module only emits `profile.completed`,
which the notifications module turns into a mail to the applicant's local board.

Gated by the `profile` feature flag. Before enabling it in an environment, create
the private `profile-media` bucket (set `SUPABASE_PROFILE_MEDIA_BUCKET` if it is
not the default name). Rationale and alternatives: ADR 0029.
