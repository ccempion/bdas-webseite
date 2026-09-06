# Mein Konto — Redesign

Date: 2026-09-06
Status: approved design, not implemented
Mockups: https://claude.ai/code/artifact/7f452199-ac4c-472e-9191-2bd32dc6d18e

## 1. Problem

`/account` is the only personal destination in `SiteHeader` for a logged-in
member, and it renders a settings form. Once a member has filled in their
profile there is no reason to open it again.

Concrete faults in `apps/web/app/account/page.tsx`:

1. **Flat hierarchy.** The member's name, their degree program and "Passwort
   ändern" all sit at the same visual weight in one `max-w-3xl` column.
2. **Alert stack.** `justSubmitted`, `status`, `openChange` and `ApprovalsAlert`
   can render four banners in sequence, pushing content below the fold.
   "Mitgliedschaft aktiv" is a durable state, not an event, and does not belong
   in a banner at all.
3. **Dead end.** The page computes `currentGroupSlug` and never links it. It
   knows nothing about the member's events, files or roles.
4. **Roles are invisible.** `getCurrentMember` already returns `grants`. A member
   granted `event_organizer` has no way to learn this except by noticing a button.
5. **Weighting inverted.** Password change occupies a full card; the GDPR data
   export is a small secondary button beside "Abmelden".
6. **The FAQ overpromises.** `apps/web/content/faq/allgemein.ts:99` tells members
   they manage E-Mail-Präferenzen here. They do not exist.

## 2. Decision

Split the surface in two.

- **`/account`** becomes a personal overview: identity, what is currently
  pending, upcoming events, group, roles, and the profile record.
- **`/account/einstellungen`** becomes the settings surface: e-mail address,
  password, data export, sign out.

Layout is the two-column direction ("Ausweis links, Leben rechts"): a fixed
identity column beside a content column. Below the `md` breakpoint the two
columns stack, producing the single-column reading order in the same source
order — there is no second layout to maintain.

Rationale: the identity column permanently answers "who am I in this federation
and what am I allowed to do", which is the question nothing currently answers,
while the content column carries what changes and can absorb sessions, files and
notification preferences later without another restructuring.

### In scope

- Overview and settings surfaces as described in §3.
- Two new content blocks: **Events & Teilnahme**, **Mitgliedschaft & Rollen**.

### Out of scope (deliberate — see §8)

- Active session list and revocation.
- E-Mail notification preferences.
- A "Meine Dateien" block.
- Any change to the profile wizard at `/profil`.

## 3. Surfaces

### 3.1 `/account` — overview

Identity column (order fixed, top to bottom):

| Block | Source |
| --- | --- |
| Avatar + name + e-mail | `getCurrentMember`, `signedProfilePhotoUrl` |
| Status / Gruppe / Mitglied seit | `member.status`, `groups`, `member.joinedAt` |
| Deine Rollen | `me.grants` |
| Quiet links: Kontoeinstellungen, Abmelden | static |

The data export is reachable from the settings page only, not from both places;
the mockup shows it in the sidebar as well, and the spec overrides the mockup here.

`Mitglied seit` renders only when `member.joinedAt` is non-null; the column omits
the row rather than printing a placeholder.

Content column:

| Block | Behaviour |
| --- | --- |
| Action items | Zero or more. Group change, pending approvals, "Bewerbung abgeschickt". Only genuinely actionable items; durable states move to the identity column as rows or chips. |
| Deine nächsten Veranstaltungen | Up to 3 upcoming registrations, each with date, time, place, registration state and an `.ics` download. Hidden entirely when the member has none. |
| Teilnahmen | Count of attended events. Hidden when zero. |
| Meine Gruppe | Card linking to `/gruppen/<slug>`. Hidden when `primaryGroupId` is null. |
| Meine Daten | The existing `EditableProfile` — record when complete, form when not. |

Waitlisted registrations render as "Warteliste, Platz N" using
`registration.waitlistPosition`, not as "angemeldet".

The existing `ApprovalsAlert` keeps its behaviour and moves into the action-item
region. It stays the only place where brand red appears by default; the
`event_organizer` role chip is the second, because both mean "open / active"
per CLAUDE.md §7.

### 3.2 `/account/einstellungen` — settings

`EmailChangeCard`, `ChangePasswordCard` and the data export move here unchanged
in behaviour, re-presented as `<details>` accordions — the canonical disclosure
pattern (CLAUDE.md §7). A back link returns to `/account`.

`/account` keeps a link to this page; no redirect and no route rename, so
existing links and the E2E selectors that target `/account` still resolve.

## 4. Data and module boundaries

All reads go through module `index.ts` surfaces (CLAUDE.md §1 rules 1 and 8).
No new tables, no migrations.

**Already available — no change needed:**

- `getCurrentMember` returns `{ user, member, grants }`. Roles need no new export.
- `member.joinedAt` exists on the `Member` type.
- `listGroups`, `getOpenGroupChange`, `getProfile`, `signedProfilePhotoUrl`,
  `isProfileComplete`, `countPendingApprovals` are all in use on the page today.
- `eventToIcs` already exists in `@bdas/events` and backs the `.ics` link.

**New exports required:**

1. `@bdas/events` — `listMyUpcomingRegistrations(db, memberId, limit)`.
   Returns upcoming, non-cancelled registrations joined to their event:
   `{ eventId, title, startsAt, location, slug, waitlistPosition }`.
   Ordered by `startsAt` ascending. One query, not N+1.
2. `@bdas/events` — `countAttendedEvents(db, memberId)`.
   `count()` over `event_attendance` where `attended = true`.
3. `@bdas/members` — `ROLE_LABELS: Record<Role, string>` in `types.ts`,
   re-exported from `index.ts`.

On (3): German role labels are currently duplicated as a private `ROLE_LABEL`
const in both `apps/web/app/(board)/_components/AuditLog.tsx` and
`RoleRoster.tsx`. The overview would be a third copy. They belong in the module
that owns the column, following the `REJECTION_CATEGORY_LABELS` precedent
already in `modules/members/src/types.ts`. Both existing components switch to
the shared export in the same PR.

Whether the member organizes an upcoming event is derived from `me.grants`
containing `event_organizer` for that event's group — no extra query, and no
call into `listManagedEvents`.

The group card links to `/gruppen/<slug>` and does **not** list board members'
names or addresses. `listBoardRecipientsForGroup` exists but returns contact
data intended for the notifier; the group page already presents its board.

## 5. States

The page serves the whole membership lifecycle. Each state is a distinct
rendering, not an accident of empty blocks.

| State | Identity column | Content column |
| --- | --- | --- |
| No member row | Avatar placeholder, e-mail only | "Profil vervollständigen" form, nothing else |
| `pending` | Status "Bewerbung eingereicht", Gruppe, no roles | Submitted notice, then the profile record. Events and Teilnahme hidden. |
| `active` | Full column | Full column |
| `inactive` / `alumnus` | Status row reflects it | Events hidden; profile record and group remain |

The `pending` and no-member-row cases are the ones where a two-column layout can
look broken. Both render single-column at every width rather than showing a
near-empty sidebar.

## 6. Visual

Every value comes from `core/design-system/src/tokens.ts`; no inline hex, radius,
shadow or duration (CLAUDE.md §7).

- Cards: `radii.md`, `border.soft`, `shadows.cardResting`; hover lift only on
  cards that are links (Gruppe, Teilnahmen).
- Settings accordions follow `recipes.accordion` exactly.
- Brand red is limited to the open-approvals alert and the `event_organizer`
  chip. Status chips are neutral.
- Role and status chips use `radii.pill`.
- Numbers that sit in columns get `tabular-nums`.

No new token is required. If one turns out to be missing during
implementation, raise it rather than adding an ad-hoc value.

## 7. Testing

Per CLAUDE.md §4, tests ship in the same PR as the code.

- **Module integration tests** (Docker Postgres, no DB mocks) for
  `listMyUpcomingRegistrations` — excludes cancelled and past events, orders by
  `startsAt`, reports waitlist position — and for `countAttendedEvents` —
  counts only `attended = true`.
- **Unit tests** for the identity-column view model: which rows and chips render
  per membership state, including `joinedAt === null`.
- **E2E**: extend `e2e/auth.e2e.ts`, which asserts the `Mein Konto` heading, and
  `e2e/profile-onboarding.e2e.ts`, which edits the extended profile on this page.
  Both must keep passing; the profile-editing flow stays reachable from
  `/account`. Add one case covering the settings sub-page.
- Existing `apps/web/app/account/profile-summary.test.ts` stays valid — the
  profile record's content is unchanged.

## 8. Follow-ups, not built here

Recorded so they do not disappear silently.

1. **Active sessions.** `auth_sessions` already stores `ip`, `user_agent`,
   `created_at` and `revoked_at`. Members cannot see or revoke a session; a lost
   laptop has no remedy beyond a password change. A read-only list plus revoke
   would close it. Settings page leaves a slot for it.
2. **E-Mail notification preferences.** Needs a new table in the notifications
   module and a check in the send path. Until it exists,
   `apps/web/content/faq/allgemein.ts:99` is wrong and should be corrected —
   either build the feature or fix the sentence.

## 9. Delivery

`ADR 0034 — Mein Konto splits into overview and settings` records the decision
(CLAUDE.md §4: decisions go in `docs/decisions/`, not commit messages).

Three PRs, one module each (CLAUDE.md §4 "one module per PR"):

| PR | Module | Contents |
| --- | --- | --- |
| 1 | `modules/events` | `listMyUpcomingRegistrations`, `countAttendedEvents`, integration tests |
| 2 | `modules/members` | `ROLE_LABELS` export; the two board components switch to it |
| 3 | `apps/web` | Overview redesign, `/account/einstellungen`, view-model tests, E2E |

PR 2 is small enough to fold into PR 3, but that would put two modules in one
PR. Flagging rather than deciding: say so if you want them combined.

`/security-review` applies to none of these on its face — no auth, payments or
files code changes — but PR 3 renders role grants to the member, so it is worth
running there anyway.
