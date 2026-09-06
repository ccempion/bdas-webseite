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

### Out of scope

- **Active sessions — decided against, not deferred.** Changing the password is
  the accepted remedy for a lost or stolen device. The platform will not offer a
  session list or per-session revocation. `auth_sessions` keeps recording `ip`
  and `user_agent`; nothing surfaces them. The settings page reserves no space
  for it.
- **E-Mail notification preferences — later, but designed for now.** The
  settings page fixes the section's name and position today (§3.2) and the
  layout is drawn as though it were already there, so landing the feature is an
  insert rather than a restructuring.
- A "Meine Dateien" block.
- Any change to the profile wizard at `/profil`.

## 3. Surfaces

### 3.1 `/account` — overview

**Fixed constraint:** the page keeps an `<h1>Mein Konto</h1>`. `e2e/auth.e2e.ts`
asserts that heading by role in three places, and it is the name the header
links to. The mockup shows the member's name as the largest text; in the build
the name is an `<h2>` inside the identity column and "Mein Konto" sits above the
two columns as a small heading. The spec overrides the mockup here.

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

Section order is fixed now and does not change when the deferred feature lands:

1. **E-Mail-Adresse** — existing `EmailChangeCard`.
2. **Passwort** — existing `ChangePasswordCard`. Its copy also carries the
   remedy for a lost device, since no session management exists: changing the
   password ends every other sign-in.
3. **E-Mail-Benachrichtigungen** — reserved. Ships later; the accordion is drawn
   in place and disabled, labelled "Kommt bald", so its arrival is an insert
   into a settled layout rather than a change to it.
4. **Deine Daten** — the GDPR export.

The disabled third accordion is not clickable and is marked `aria-disabled`, so
it announces itself as unavailable rather than as a broken control.

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
- `eventToIcs` already exists in the events module and backs the `.ics` link.

**Package naming, easy to get wrong:** the events *module* is
`@bdas/events-module`. `@bdas/events` is the core event **bus** in `core/events`.

**New exports required:**

1. `@bdas/events-module` — `listMyUpcomingRegistrations(db, memberId, limit)`.
   Upcoming, non-cancelled registrations joined to their published event:
   `{ eventId, title, startsAt, location, groupId, waitlistPosition }`.
   Ordered by `startsAt` ascending. One query, not N+1.
2. `@bdas/events-module` — `countAttendedEvents(db, memberId)`.
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

**`active` is the design target.** In practice the platform has active members
and essentially nobody else, so the two-column layout is drawn for that case and
the remaining states get a correct but plain fallback. Designing them properly
is deferred.

| State | Treatment |
| --- | --- |
| `active` | The full design, as specified in §3.1. |
| everything else | Single column at every width: status line, then the profile record. No identity sidebar, no events, no attendance. |

One caveat worth stating rather than discovering later: registration still walks
a new applicant through *no member row* → `pending` before they ever become
active, so the fallback is on the live path for every new member, not a dead
branch. It has to be correct and unembarrassing — it does not have to be
designed. The fallback is close to today's page, which is why it is cheap.

`inactive` and `alumnus` take the same fallback until someone asks for more.

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

1. **E-Mail notification preferences.** Needs a table in the notifications
   module and a check in the send path. Its place in the settings page is
   already fixed (§3.2 item 3), so the follow-up adds the form and the storage,
   nothing else.
2. **The FAQ currently overpromises.** `apps/web/content/faq/allgemein.ts:99`
   tells members they manage E-Mail-Präferenzen under "Mein Konto". That stays
   untrue until follow-up 1 ships. Either soften the sentence in PR 3 or accept
   that it is wrong in the meantime — worth a decision, not a silent carry.
3. **States other than `active`** (§5) get a plain fallback for now.

Not a follow-up: **active sessions**, decided against in §2.

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
