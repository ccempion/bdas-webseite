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
