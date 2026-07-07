# "Meine Gruppe" navigation + events group filter — design

**Date:** 2026-07-07
**Status:** Approved (design), pending implementation plan
**Surface:** `apps/web` public shell (behind `public_shell` flag); no module service changes

## Problem

Two gaps in the logged-in member experience:

1. The `/dateien` page (per-member-kind folder access) is **not wired into the navigation at all**, and a member's own group page (`/gruppen/[slug]`) is only reachable by drilling down from the full group list. Members have no direct "my group" entry point.
2. `/events` lists all upcoming events with no way to narrow to specific groups (or federation-wide events), even though members typically care about a subset.

## Context (verified in codebase)

- **Nav** is computed per-request in `apps/web/app/_public/nav-items.ts` and rendered by `PublicHeader.tsx`. `NavItem` is either a leaf (`{label, href}`) or a dropdown (`{label, children[]}`); both desktop and mobile already render the dropdown shape.
- **Member → group:** `Member.primaryGroupId: string | null`. Resolve to a slug via `getGroup(db, id)` (exported from `@bdas/groups`). Alumni retain `primaryGroupId`.
- **Alumnus role:** already defined — `alumnus` is both a `Role` (`@bdas/auth`, in `ALL_ROLES`) and a `MemberStatus`. Status `alumnus` implies an unscoped `alumnus` grant (ADR 0007). Currently inert (no `isAlumnus()` helper, no alumnus-only surface). **Out of scope** to change here.
- **Events:** `listUpcomingEvents(db, viewer)` returns visibility-filtered upcoming events, each carrying `groupId: string | null` (`EventWithCounts`). The page already filters the fetched set by visibility in JS. **No caller uses the `ListOpts.groupId` option** — so group filtering can be done in the page without touching the module.

## Part A — "Meine Gruppe" dropdown

**Visibility:** shown when the viewer is logged in, `me.member.primaryGroupId` is set, the `groups` flag is on, and the group resolves to a **non-archived** record (archived → hidden, because its public page 404s). Applies to all members, including alumni. Board members also see it (Board-Bereich stays a separate item).

**Contents:**
- `Übersicht → /gruppen/[slug]` (the existing public group page)
- `Dateien → /dateien`

**Placement:** in the main nav list after "Gruppen", before the account/name dropdown. Renders in desktop and mobile without new rendering code (existing `children` dropdown path).

**Data flow:**
- `nav-items.ts` stays DB-free — extend `navItems()` to accept `{ isFederal?, myGroup? }` where `myGroup?: { slug: string }`. When `myGroup` is present, append the "Meine Gruppe" dropdown.
- `PublicHeader.tsx` performs the lookup: for a logged-in member with `primaryGroupId`, call `getGroup(db, primaryGroupId)`; if it exists and `status !== "archived"`, pass `myGroup: { slug }`. Wrap the lookup in `cache()` so repeat renders in one request share it. One extra indexed lookup, only for logged-in members with a group.

## Part B — events multi-select group filter

Multi-select **without** a service change — the page already fetches the full visible set; derive the filter from it.

**Mechanism:** URL param `?groups=<slug>,<slug>,bundesweit` (comma-separated), fully server-rendered (no client JS), consistent with the codebase's server-component style.

**Page flow (`events/page.tsx`):**
1. Fetch all upcoming visible events: `listUpcomingEvents(db, viewer)` (unchanged).
2. Fetch group names/slugs via `listGroups(db)`; build an `id → { name, slug }` map.
3. Derive the distinct **owners present** in the visible events: the set of non-null `groupId`s that appear, plus a synthetic `bundesweit` bucket iff any event has `groupId === null`. Only owners with ≥1 event become chips.
4. Parse `?groups=` into a selected set of slugs (+ `bundesweit`); ignore tokens not in the present-owners set. Empty/absent → show all.
5. Filter the event list in JS by the selected set.
6. Render a chip bar: each chip is a `<Link>` whose href is the current selection with that chip toggled in/out; plus an "Alle" reset link. Active chips use the brand-accent active state from `core/design-system` tokens (no inline hex/radius/shadow).

**Extraction for testability:**
- Pure helpers (no React/DB), unit-tested:
  - `deriveOwners(events, groupMap)` → ordered list of `{ key, label }` chips (`key` = slug or `bundesweit`).
  - `filterByGroups(events, selectedKeys, groupMap)` → filtered events.
  - A helper to compute a chip's toggled href from the current selection.
- A small presentational `EventFilterBar` component consuming the derived chips + current selection.
- `events/page.tsx` wires them together.

**Empty state:** when a selection yields no events, reuse the existing "Keine Veranstaltungen" alert (copy may note the active filter).

## Non-goals (YAGNI)

- No new alumnus authorization/gating — role stays inert unless requested.
- No changes to the `(board)` area or Board-Bereich.
- No `@bdas/events-module` service change.
- No richer member-only group home — "Übersicht" reuses the public `/gruppen/[slug]`.
- Chips are plain server links, not a client component.

## Testing

- **Unit:** `nav-items` includes "Meine Gruppe" iff `myGroup` provided (and not otherwise); events filter helpers — owner derivation (present-only, includes `bundesweit` when applicable), chip-toggle href math, and `filterByGroups`.
- **Regression:** the §23 events create-flow E2E (`e2e/events.e2e.ts`) must stay green; optionally add one assertion that a group chip filters the list.

## Files touched

- `apps/web/app/_public/nav-items.ts` — `navItems({ isFederal?, myGroup? })` + "Meine Gruppe" dropdown.
- `apps/web/app/_public/PublicHeader.tsx` — resolve member group slug (cached), pass `myGroup`.
- `apps/web/app/events/page.tsx` — filter wiring.
- `apps/web/app/events/EventFilterBar.tsx` (new) — chip bar.
- Pure filter helper module (new) + its unit test.
- `apps/web/app/_public/nav-items.test.ts` (new or extended) — nav unit test.
