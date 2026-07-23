# Profile Data — Design Spec

**Issue:** #52 (Profile Data) + sub-issues #96 (Änderung der Daten) + #97 (moderne UX)
**Date:** 2026-07-23
**Status:** Design approved — pending implementation plan
**Feature flag:** `profile`

---

## 1. Context

New members should reach the platform through a two-phase onboarding: a
minimal registration, then a guided completion of their full profile after
email verification. The federation needs richer member data than the platform
currently stores — course of study, degree type, university, date of birth,
BDAS group, how the person found BDAS, and an optional photo.

Today the system already has most of the plumbing:

- **Registration** (`apps/web/app/registrieren/`): email + password + consent.
  The form renders first/last name inputs but `registerAction` **drops them** —
  a latent bug this work fixes.
- **Email verification** (`modules/auth`, `/verifizieren/<token>`): complete;
  flips `auth_users.status` to `active`.
- **Member profile** (`modules/members`): owns `first_name`, `last_name`,
  `primary_group_id`, `status` (`pending → active`). A member row is created
  today only later, on `/account`, via `createProfile`.
- **Board approval** (`modules/members` `transitionStatus`/`approveMember`,
  `list-pending`): the **local board** of a member's group decides
  `pending → active` (`canDecideJoinRequest`), with federal board as fallback
  when the group has no local board.

The members module **deliberately does not model** university, degree, birth
date, or photos (platform spec §1). So the extended profile is a **new module**,
not a members extension.

Intended outcome: a person registers with name + email + password, verifies,
is guided through a multi-step wizard to complete their profile, and the local
board sees a complete application (including who referred them) to approve. The
same fields are editable later under "Mein Konto".

---

## 2. Decisions (locked during brainstorming)

| Topic | Decision |
|---|---|
| Scope | One spec covering fields + completion flow + referral signal + later editing + wizard UX |
| Onboarding auth | **Keep password.** Registration = email + first name + last name + password + consent. Fix the name-drop bug. |
| Module boundary | **New `modules/profile`**, own table keyed by `user_id`, own flag, migration, events. `members` unchanged. |
| Referral | **Signal only.** Free-text referrer name stored + shown to the board; no automated in-app vouch. Board still makes the sole `pending → active` decision. |
| UX | **Multi-step wizard** in the BDAS visual language. |
| Studiengang | Free text. |
| Uni | Curated list of German universities + a **"Sonstige" → free text** fallback. |
| Photo | Optional; **private `profile-media` bucket**, shown via short-lived signed download URLs (owner + board). |
| Board notification | **Yes.** `profile.completed` → notifications subscriber informs the responsible local board (federal fallback). |

---

## 3. Onboarding flow (end-to-end)

1. **Register** `/registrieren`: email + first name + last name + password +
   consent. `registerAction` now (a) calls `register(...)` (auth), then (b)
   calls `createProfile(getDb(), { userId, firstName, lastName })` (members,
   status `pending`, no group yet) so names are persisted immediately, then
   (c) sends the verification email. Unverified accounts with a pending member
   row are acceptable orphans, exactly like today's unverified auth users.
2. **Verify** `/verifizieren/<token>`: `verifyEmail` flips auth status to
   `active`, then the page redirects into the profile wizard instead of the
   static success page.
3. **Wizard** (see §5): Studium → Uni + Gruppe → Geburtsdatum → Gefunden durch →
   Profilbild (optional) → Absenden.
4. **Submit** writes the `member_profiles` row with `completed_at` set and
   updates `members.primary_group_id`; emits `profile.completed`. The
   application now appears in the group's board **pending list** with all
   fields incl. referrer name.
5. **Approve**: the local board decides `pending → active` via the existing
   `approveMember` — the single, unchanged approval point.
6. **Edit later (#96)**: the same form component is embedded on `/account`
   ("Mein Konto") for editing; submit calls `saveProfile` (update path) and,
   for group, the existing members path.

**"Profile complete?" gate:** a profile is complete when a `member_profiles`
row exists with `completed_at IS NOT NULL` **and** `members.primary_group_id`
is set. On sign-in, an incomplete profile routes the user to the wizard
(reuse of the `/account` / dashboard session helpers in
`apps/web/app/_dashboard/session.ts`).

---

## 4. Module `modules/profile`

Mirrors the `content`/`members` template (single `index.ts` surface, own
schema/migrations/README/tests, zod validation, authorization inside the
module, typed events).

### 4.1 Table `member_profiles`

Owned solely by this module; linked by `user_id` (like `members.user_id`, no
cross-module FK). RLS enabled with no policies — only the service-role
connection reads/writes.

| Column | Type | Notes |
|---|---|---|
| `user_id` | text PK | matches `auth_users.id` |
| `studiengang` | text NOT NULL | free text |
| `abschlussart` | text NOT NULL | enum key (below) |
| `uni` | text NOT NULL | the resolved university name (list value, or the free-text value when "Sonstige") |
| `geburtsdatum` | date NOT NULL | valid past date |
| `gefunden_durch` | text NOT NULL | enum key (below) |
| `empfehler_name` | text NULL | set only when `gefunden_durch = 'empfehlung'` |
| `photo_storage_key` | text NULL | key in the private `profile-media` bucket |
| `completed_at` | timestamptz NULL | stamped on first successful submit |
| `updated_at` | timestamptz NOT NULL | |
| `updated_by` | text NOT NULL | acting `user_id` |

### 4.2 Enums (stored as stable keys; German labels in the UI)

- **abschlussart**: `bachelor | master | doktor | staatsexamen | duales_studium | diplom`
- **gefunden_durch**: `webseite | instagram | empfehlung`
- **uni**: curated list of German universities, exported as a constant from the
  module so server validation and the UI share one source of truth. Selecting
  "Sonstige" reveals a free-text field; the typed value is stored directly in
  `uni` (no separate column). Validation: value must be in the list **or** a
  non-empty free-text string when "Sonstige" was chosen.

### 4.3 Public surface `src/index.ts`

- `getProfile(db, userId): Promise<MemberProfile | null>`
- `saveProfile(db, { userId, fields, actor }): Promise<MemberProfile>` —
  upsert; stamps `completed_at` on first complete submit, `updated_at`/
  `updated_by` always. **Authorization in the module:** only the owner
  (`actor.userId === userId`) may write.
- `canViewProfile(actor, ownerUserId)` helper, or read authz enforced in the
  route: **owner or any board grant**.
- Exported data/types: `ABSCHLUSSART_OPTIONS`, `GEFUNDEN_DURCH_OPTIONS`,
  `UNIVERSITIES`, `MemberProfile`, `SaveProfileInput`, event types.
- Validation via **zod** (`SaveProfileInput`), errors via `@bdas/errors`
  (`ValidationError` with a flattened field map feeding `state.fields`, like
  `modules/members/src/services/profile.ts`).

### 4.4 Events `src/events.ts`

- `profile.completed` — `{ userId, groupId, at }`, emitted when `completed_at`
  transitions from null to set.
- `profile.updated` — `{ userId, at }`, emitted on subsequent edits.

### 4.5 Migration

`modules/profile/migrations/0001_init.sql`; append `"profile"` to
`infra/migrations/src/manifest.ts` **after** `members`.

### 4.6 Feature flag

Add `profile` to `FLAGS` in `core/feature-flags`; off in production until
acceptance-complete. Every route/API/nav entry gates on `isFlagOn("profile")` /
`requireFlag("profile")`.

---

## 5. Wizard UX (#97)

Multi-step, client-state (no server-side draft persistence — YAGNI). Steps,
each validated before advancing:

1. **Studium** — Studiengang (free text) + Abschlussart (native `<select>`).
2. **Uni & Gruppe** — Uni (list + "Sonstige") + BDAS-Gruppe (existing groups
   select → `members.primary_group_id`).
3. **Geburtsdatum** — `<Input type="date">`.
4. **Gefunden durch** — `<select>`; on `empfehlung` reveal the referrer-name
   free-text field.
5. **Profilbild** — optional upload (see §7).
6. **Review & submit** — one server action writes both `member_profiles`
   (`saveProfile`) and `members.primary_group_id` (existing members path).

Visual language strictly from `core/design-system` tokens (three radii, soft
shadows, brand red only for active/accent, accordion/fade idiom, ~200/300/400ms
durations). Reuse the `Form`/`Field`/`Label`/`Input`/`Button`/`Alert`
primitives and the native-`<select>`-styled-as-`Input` pattern already used in
`apps/web/app/account/ProfileForm.tsx`. Progress indicator built from tokens.

The same field components back the **"Mein Konto" edit form (#96)** as a single
page (not stepped), reusing the wizard's field building blocks.

---

## 6. Referral signal

No automated in-app vouch flow. When `gefunden_durch = empfehlung`, the
free-text `empfehler_name` is stored and surfaced in the board's pending list
(`apps/web/app/…` board review + `modules/members` `list-pending`). The board
maps and contacts the referrer out of band and makes the existing
`pending → active` decision. The referral field is informational; it never
gates status by itself.

---

## 7. Photo upload (private)

- New **private** bucket accessor in `core/storage`: `getProfileMediaStorage()`
  (env `SUPABASE_PROFILE_MEDIA_BUCKET`, default `profile-media`), analogous to
  the existing private files bucket `getStorage()` — **not** the public
  content/event-media pattern.
- Upload route `apps/web/app/api/profile/upload-url/route.ts`: POST, gates
  `isFlagOn("profile")` + authenticated session; the actor may upload only
  their **own** photo. Mints a signed upload URL. Mime allowlist
  `image/{jpeg,png,webp,avif}`, size cap ≤ 5 MB. Storage key
  `<userId>/<uuid>.<ext>`. Client mirrors `apps/web/app/_content/FotoField.tsx`
  (request URL → PUT bytes → store key).
- Display: wherever the photo shows (wizard preview, `/account`, board pending
  list, member detail), a **short-lived signed download URL** is minted
  server-side via `signedDownloadUrl`. No public URLs. Orphaned objects are
  tolerated (no sweeper), consistent with content-media.
- The app never proxies file bytes (spec §11).

---

## 8. Board notification

Add a subscriber (in `modules/notifications`, wired at boot like the existing
`*-bootstrap.ts`) on `profile.completed`. It resolves the responsible
recipients — the local board of the member's `primary_group_id` (federal board
fallback when the group has no local board) — via the members public surface,
and sends a templated "neue Bewerbung zur Prüfung" notification. Follows the
existing event → notifications-subscriber pattern; no cross-module service call
for the side effect.

---

## 9. Cross-module data flow (rule compliance)

The wizard/account submit is orchestrated at the **app layer**, writing to two
independent modules:

- `members` — names (registration) and `primary_group_id` (existing services:
  `createProfile`, `changePrimaryGroup`/profile update).
- `profile` — the new fields (`saveProfile`).

The modules never import each other; they are linked only by `user_id` and by
the `profile.completed` event the notifications module consumes. No circular
dependencies.

---

## 10. Security

Auth-adjacent + upload + **personal data** (birth date, photo) → the PR gets
`/security-review`.

- Registration/verification unchanged in trust model; names now persisted.
- Profile **write**: owner only, enforced in the module and re-checked at the
  route.
- Profile **read**: owner or any board grant; enforced at the route
  (`getCurrentMember` → grants → `canAdministerBoard`/scope helpers in
  `modules/dashboard-shell`/`modules/members`).
- Upload: authenticated, own-photo-only, mime + size validated, signed URLs
  only; private bucket, signed downloads with short TTL.
- Enum/date/size validation server-side; oversized JSON rejected.
- **Data export** (`apps/web/app/account/datenexport/route.ts`) extended to
  include the new profile fields (DSGVO subject-access completeness).

---

## 11. Testing

- **Module (Docker Postgres, real DB):** create/get/update roundtrip · upsert
  overwrites · required-field / invalid-enum / invalid-date rejected · oversized
  input rejected · non-owner write rejected · `completed_at` stamped once ·
  `updated_by`/`updated_at` stamped · `profile.completed` emitted on first
  complete, `profile.updated` on edit.
- **Web unit:** wizard step-validation (each step blocks on invalid input) ·
  `nav-items.test.ts` entry present with flag on / absent with flag off · API
  route tests for `/api/profile/upload-url` and the save action (401 / 403 /
  422 / success) · "Sonstige" reveals + stores free-text uni.
- **e2e (Playwright):** register → verify → wizard → submit → board pending list
  shows the application with referrer name · editor/wizard routes 404 for
  anonymous when flag off · edit in "Mein Konto" persists · profile-incomplete
  sign-in routes to the wizard.

---

## 12. Rollout

1. Merge behind `profile` flag (off in production).
2. Enable in preview; walk a test registration end-to-end incl. board approval.
3. Enable in production; wizard, nav entry, and board notification go live.
