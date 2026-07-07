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

## Part A — "Meine Gruppe" dropdown + "Dateien" item

Two separate nav additions, deliberately decoupled so files access does not depend on the group page resolving.

### A1 — "Meine Gruppe" dropdown
**Visibility:** shown when the viewer is logged in, `me.member.primaryGroupId` is set, the `groups` flag is on, and the group resolves to a **non-archived** record (archived → hidden, because both its items need the slug and the public page 404s). Applies to all members, including alumni. Board members also see it (Board-Bereich stays a separate item).

**Contents:**
- `Übersicht → /gruppen/[slug]` (the existing public group page)
- `Events → /events?groups=[slug]` (deep-link into the Part B filter, pre-scoped to the member's group)

### A2 — "Dateien" top-level item
**Visibility:** a standalone leaf item (not inside the dropdown), shown when the viewer is a signed-in member with a profile (`me.member` present) **and** `isFlagOn("files")`. Independent of the group lookup — an alumnus whose group was archived keeps their Dateien entry. Flag-gated so it never renders while `BDAS_FLAG_FILES` is off (no dead link). `→ /dateien`.

**Placement:** in the main nav list after "Gruppen" — "Meine Gruppe" then "Dateien" — before the account/name dropdown. Both render in desktop and mobile without new rendering code (existing `children`/leaf paths).

**Data flow:**
- `nav-items.ts` stays DB-free — extend `navItems()` to accept `{ isFederal?, myGroup?, showFiles? }` where `myGroup?: { slug: string }` and `showFiles?: boolean`. Append the "Meine Gruppe" dropdown when `myGroup` is present; append the "Dateien" leaf when `showFiles` is true.
- `PublicHeader.tsx` computes both: for a logged-in member with `primaryGroupId`, call `getGroup(db, primaryGroupId)` and pass `myGroup: { slug }` iff it exists and `status !== "archived"` (wrapped in `cache()`); set `showFiles = Boolean(me?.member) && isFlagOn("files")`.

## Part B — events group filter + past events

### B1 — multi-select group filter
Multi-select **without** a service change — the page already fetches the full visible set; derive the filter from it.

**Mechanism:** URL param `?groups=<slug>,<slug>,bundesweit` (comma-separated), fully server-rendered (no client JS), consistent with the codebase's server-component style.

**Page flow (`events/page.tsx`):**
1. Fetch visible events for the active timeframe (see B2); default upcoming via `listUpcomingEvents(db, viewer)`.
2. Fetch group names/slugs via `listGroups(db)`; build an `id → { name, slug }` map.
3. Derive the distinct **owners present** in the visible events: the set of non-null `groupId`s that appear, plus a synthetic `bundesweit` bucket iff any event has `groupId === null`. Only owners with ≥1 event become chips.
4. Parse `?groups=` into a selected set of slugs (+ `bundesweit`); ignore tokens not in the present-owners set. Empty/absent → show all.
5. Filter the event list in JS by the selected set.
6. Render a chip bar: each chip is a `<Link>` whose href is the current selection with that chip toggled in/out; plus an "Alle" reset link. Active chips use the brand-accent active state from `core/design-system` tokens (no inline hex/radius/shadow).

### B2 — past events
- **Default:** upcoming only (unchanged behaviour).
- **Toggle:** a `?past=1` URL param surfaced as a "Vergangene anzeigen" toggle in the filter bar. When on, the page also fetches past events and renders them in a separate **"Vergangene"** section below **"Kommende"**.
- **Visual "passed" marker (per request):** past events are de-emphasised using the muted ink token (`text-bdas-ink-muted` / reduced emphasis) and carry a **"Vorbei"** badge. No new token — reuse existing muted ink + badge styling.
- **Group chips apply to both sections** — the derived owner set is the union of owners present across the fetched (upcoming ∪ past when toggled) events.
- **Module addition (unavoidable):** add `listPastEvents(db, viewer, opts?)` to `@bdas/events-module`, mirroring `listUpcomingEvents` but with `startsAt < now` and newest-first ordering, sharing the same visibility filter (factor the common query into an internal helper; expose two thin public functions). Export from the module `index.ts`; update `modules/events/README.md`. This is the one place Part B touches a module.

**Extraction for testability:**
- Pure helpers (no React/DB), unit-tested:
  - `deriveOwners(events, groupMap)` → ordered list of `{ key, label }` chips (`key` = slug or `bundesweit`).
  - `filterByGroups(events, selectedKeys, groupMap)` → filtered events.
  - A helper to compute a chip's toggled href from the current selection (preserving `past`).
- A small presentational `EventFilterBar` component consuming the derived chips + current selection + the past toggle.
- `events/page.tsx` wires them together.

**Empty state:** when a selection yields no events, reuse the existing "Keine Veranstaltungen" alert (copy may note the active filter).

## Non-goals (YAGNI)

- No new alumnus authorization/gating — role stays inert unless requested (revisit later).
- No changes to the `(board)` area or Board-Bereich.
- No richer member-only group home — "Übersicht" reuses the public `/gruppen/[slug]`.
- Chips and the past toggle are plain server links/params, not a client component.
- No group-filtered ICS/calendar feed (possible future pairing with the filter).

## Testing

- **Unit:** `nav-items` — "Meine Gruppe" appears iff `myGroup` provided; "Dateien" appears iff `showFiles` true; both absent otherwise. Events filter helpers — owner derivation (present-only, includes `bundesweit` when applicable), chip-toggle href math (preserving `past`), and `filterByGroups`.
- **Module (real Postgres, per rule 5):** `listPastEvents` returns only `startsAt < now`, newest-first, visibility-filtered — mirroring the existing `listUpcomingEvents` tests.
- **Regression:** the §23 events create-flow E2E (`e2e/events.e2e.ts`) must stay green; optionally add one assertion that a group chip filters the list.

## Files touched

- `apps/web/app/_public/nav-items.ts` — `navItems({ isFederal?, myGroup?, showFiles? })` + "Meine Gruppe" dropdown + "Dateien" leaf.
- `apps/web/app/_public/PublicHeader.tsx` — resolve member group slug (cached) + compute `showFiles`; pass both.
- `apps/web/app/events/page.tsx` — filter + past-events wiring.
- `apps/web/app/events/EventFilterBar.tsx` (new) — chip bar + past toggle.
- Pure filter helper module (new) + its unit test.
- `apps/web/app/_public/nav-items.test.ts` (new or extended) — nav unit test.
- `modules/events/src/services/list.ts` — add `listPastEvents` (shared internal query helper).
- `modules/events/src/index.ts` — export `listPastEvents`; `modules/events/README.md` — document it.
- `modules/events/src/services/list.test.ts` (or module test) — `listPastEvents` coverage.
