# Editable Group Pages — Design

**Date:** 2026-07-18
**Status:** Approved (brainstorming session, issue #48)
**Builds on:** ADR 0007 (scoped role grants), ADR 0013 (lead delegation), ADR 0023 (Puck for board-editable content pages)

## Problem

Local groups cannot shape their own public presentation. `/gruppen/[slug]` renders
only city, name, and a contact card from `@bdas/groups` data. Groups (e.g. BDAS
Aachen) should author their own page content in the browser — via the existing
Puck editor — without a developer round-trip, and their upcoming events should be
visible on the page.

## Requirements

1. A group's public page is editable via Puck; everything except the fixed page
   header (BDAS name + city) can be authored by the group.
2. The group lead (`local_board_lead`) selects who may edit: individual members
   of the group's own board. The lead can always edit; so can federal board
   (BDAS Deutschland admins). Plain `local_board` members without selection
   cannot edit.
3. Upcoming events of the group render at the bottom of the public page, each
   linking to its event page.
4. Authorized viewers see a "Seite bearbeiten" entry on the public page, and the
   board sidebar links to the public page.

## Decisions (from brainstorming)

- **Editor rights:** new group-scoped role `page_editor`, granted/revoked by the
  lead on the existing Vorstand page (like `event_organizer`). Not the whole
  board automatically.
- **Events placement:** bottom of the page, below the Puck content.
- **Contact card:** stays fixed/server-rendered (single source of truth in the
  board profile); only the area between header/contact and events is Puck-editable.
- **Puck palette:** add a generic "Bild" block; generalize the Personen-Raster
  field label "Rolle im BSR" → "Rolle". No larger palette for now.
- **Save authorization:** scope parameter on `savePage` (approach A). The route
  resolves `gruppen/<slug>` → group and passes `scope: { groupId }`; the content
  module stays groups-agnostic and keeps owning save-authorization (ADR 0023).
  Rejected: content module resolving slugs itself (would couple content→groups,
  §1 rules 1/3); route-layer-only authorization (moves the check out of the
  module, against ADR 0023).

## Design

### 1. Role `page_editor` (group-scoped)

- `@bdas/auth`: add `page_editor` to the `Role` union.
- `@bdas/members`: add to `ALL_ROLES`; `requireValidScope` treats it like
  `local_board` (groupId required); `requireCanGrant` allows federal board or a
  `local_board_lead` of that group (same branch as `local_board`/`event_organizer`).
- New helper exported from `@bdas/members`:
  `canEditGroupPage(grants, groupId)` = `federal_board` ∨ (`local_board_lead` ∨
  `page_editor` scoped to `groupId`).
- Vorstand page (`/gruppe/[slug]/vorstand`): add role option
  `{ role: "page_editor", label: "Seiten-Editor", groupId }` to the existing
  `GrantRoleModal`; roster/audit views pick it up automatically.
- No migration: `member_role_grants.role` is a text column.

### 2. Content module: scope-aware save

- `savePage(db, { slug, data, actor, scope? })` where
  `scope?: { groupId: string }`.
  - Without `scope`: federal-only, exactly as today (BSR/BDAJ/Impressum/
    Datenschutz unchanged).
  - With `scope`: allow `federal_board`, or `local_board_lead`/`page_editor`
    grants whose `groupId` matches. The check runs on the `ActorGrant` array the
    caller passes — no import from `@bdas/members`.
- `PUT /api/content/pages/[...slug]`: when the slug matches `gruppen/<slug>`,
  resolve the group via `@bdas/groups` (404 if missing or archived) and pass
  `scope: { groupId: group.id }`.
- `POST /api/content/upload-url`: accept optional `groupSlug` in the body; when
  present, authorize via `canEditGroupPage` instead of `isFederalBoard`.

### 3. Public page `/gruppen/[slug]`

Order: fixed header (city, name, dormant alert) → fixed contact card → Puck
content (`<Render>` of slug `gruppen/<slug>`, omitted when no document) →
"Kommende Events" section at the bottom via
`listUpcomingEvents(db, viewer, { groupId })` (visibility-filtered; anonymous
viewers use the events module's `ANON`), each item linking to `/events/[id]`;
section omitted when empty. Viewers passing `canEditGroupPage` see the
"Seite bearbeiten" link (Impressum pattern) to the editor route.

### 4. Editor route `/gruppen/[slug]/bearbeiten`

BSR pattern: 404 unless `groups` and `content` flags are on; resolve group (404
if missing/archived); 404 unless `canEditGroupPage` (no existence leak, spec
§6); load document, render `PuckEditor` with slug `gruppen/<slug>`.

### 5. Navigation

`groupNav(slug)` gains `{ href: "/gruppen/<slug>", label: "Öffentliche Seite" }`.
No federal nav entry: federal board reaches any group page via the public list
and sees the edit button everywhere.

### 6. Puck palette

- New block **Bild**: image upload (reuse `FotoField`), required alt text,
  optional caption. Uploads go through the extended upload-url route.
- Personen-Raster: field label "Rolle im BSR" → "Rolle" (label-only; stored
  documents untouched).

## Flags

No new module, no new flag. Group page surfaces gate on `groups` + `content`.

## Testing

- **Content module (Docker Postgres):** scoped `savePage` — lead ✓,
  `page_editor` of the group ✓, plain `local_board` ✗, `page_editor` of another
  group ✗, `federal_board` ✓; unscoped saves still federal-only.
- **Members module:** lead grants/revokes `page_editor` in own group ✓, plain
  board member ✗, lead of another group ✗.
- **E2E (existing content-pages pattern):** public group page renders Puck
  content + events; editor entry visible to authorized users; `/bearbeiten`
  404s for members without the role.
- **Manual verification:** drive both provided logins (board + member
  perspective) via Playwright against the dev server.

## ADR

One new ADR in `docs/decisions/`: `page_editor` role and group-scoped content
saves (extends ADR 0013 delegation and ADR 0023 save-authorization).
