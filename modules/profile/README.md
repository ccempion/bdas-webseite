# @bdas/profile

Owns `member_profiles` — the federation's extended member data (course of
study, degree type, university, birth date, "found BDAS via", optional photo).
Keyed by `user_id`, no cross-module FK. The `members` module deliberately does
**not** model these fields (platform spec §1); this module is the home for them.

Public surface: `src/index.ts` only. Authorization (owner-only writes) lives in
the service. Emits `profile.completed` / `profile.updated` on the core bus.

Photos live in the **private** `profile-media` bucket (`core/storage`
`getProfileMediaStorage()`); the app mints short-lived signed URLs — never a
public URL, never proxied bytes.
