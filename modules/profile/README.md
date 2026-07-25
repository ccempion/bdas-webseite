# @bdas/profile

Owns `member_profiles` — the federation's extended member data (course of
study, degree type, university, birth date, "found BDAS via", optional photo).
Keyed by `user_id`, which FKs `auth_users(id) ON DELETE CASCADE` so erasing an
identity erases the profile with it — this row holds personal data (birth date,
university, referral, private photo key), so it must not outlive its user. The
`members` module deliberately does **not** model these fields (platform spec
§1); this module is the home for them.

Public surface: `src/index.ts` only. Authorization (owner-only writes) lives in
the service. Emits `profile.completed` / `profile.updated` on the core bus.

Photos live in the **private** `profile-media` bucket (`core/storage`
`getProfileMediaStorage()`); the app mints short-lived signed URLs — never a
public URL, never proxied bytes.

Completing a profile grants no membership status: `members.approveMember` stays
the sole `pending → active` decision. This module only emits `profile.completed`,
which the notifications module turns into a mail to the applicant's local board.

Gated by the `profile` feature flag. Before enabling it in an environment, create
the private `profile-media` bucket (set `SUPABASE_PROFILE_MEDIA_BUCKET` if it is
not the default name). Rationale and alternatives: ADR 0029.
