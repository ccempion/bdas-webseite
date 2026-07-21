# Move event management from the nav bar onto the `/events` page

Date: 2026-07-18
Status: Approved (design)

## Problem

The "Verwalten" entry point for events lives in the top navigation, but only for
**federal board** members: `navItems({ isFederal })` renders an Events dropdown
of `Übersicht` + `Verwalten` for federal users, and a plain `Events` link for
everyone else (`apps/web/app/_public/nav-items.ts`).

Local board members and group `event_organizer`s are equally authorized to manage
their group's events (`canManage` in `modules/events/src/services/get.ts` — ADR
0017), yet they get **no management entry point in the nav at all**. They must
type `/admin/events` by hand.

## Goal

- Remove the federal-only "Verwalten" item from the Events nav dropdown.
- Surface management on the `/events` page instead, for **everyone authorized**
  (federal board, local board, or event organizer), via buttons.
- Add a small number of further shortcuts on that page to ease navigation for
  authorized users.

Non-goal: any change to Gruppen navigation, the admin pages themselves, or what
`/events` shows to the public (it stays published-only).

## Authorization

The single predicate reused throughout:

```
canManageAny = viewer.isFederal
  || viewer.boardGroupIds.length > 0
  || viewer.organizerGroupIds.length > 0
```

This is identical to the guard already used at `apps/web/app/admin/events/page.tsx`
and `neu/page.tsx`. `viewer` comes from `viewerFrom(me)` (`apps/web/lib/event-viewer.ts`),
which is already imported on the `/events` page.

Per-card manageability reuses the events module's `canManage(viewer, e)` — which
returns true for federal, or when the event's `groupId` is in the viewer's board
or organizer groups.

## Changes

### 1. Navigation — `apps/web/app/_public/nav-items.ts`

The Events item becomes a plain flat link for all users:

```ts
if (isFlagOn("events")) {
  items.push({ label: "Events", href: "/events" });
}
```

- Removes the `isFederal ? {dropdown} : {flat}` branch for Events only.
- `isFederal` remains a parameter of `navItems` — Gruppen still uses it for its
  own `Übersicht`/`Verwalten` dropdown, which is unchanged.
- Mobile nav renders from the same `navItems` output, so it inherits the change
  automatically; no separate mobile edit.

### 2. `/events` page header — `apps/web/app/events/page.tsx`

- Compute `canManageAny` from the already-available `viewer`.
- Change the `<header>` from a stacked title block to a two-column layout:
  title + subtitle on the left, action buttons on the right, wrapping on narrow
  screens (`flex flex-wrap items-start justify-between gap-4`).
- Render the buttons **only when `canManageAny`**, mirroring the established
  `<Link href><Button/></Link>` pattern from the admin page:
  - **Neue Veranstaltung** — `variant="primary"` → `/admin/events/neu`
  - **Verwalten** — `variant="secondary"` → `/admin/events`

`Button` (`core/design-system/src/components/Button.tsx`) is a `<button>` element
with variants `primary | secondary | ghost`; it is wrapped in a `next/link`
`<Link>` exactly as `apps/web/app/admin/events/page.tsx` already does.

### 3. Per-card "Bearbeiten" pill — `EventCard` in `apps/web/app/events/page.tsx`

On each card where `canManage(viewer, e)` is true, render a small **Bearbeiten**
link to `/admin/events/{e.id}`.

`EventCard` currently accepts `{ e, past }` only. Extend it to also receive
`canEdit: boolean` (computed by the page with `canManage(viewer, e)`) so the
component stays free of viewer/authorization logic.

**Nested-anchor fix (required).** The card is currently one big `<Link>` wrapping
its whole body; nesting a second `<a>` (the Bearbeiten link) inside is invalid
HTML. Restructure with the stretched-link pattern:

- Card container becomes `relative`.
- The existing detail `<Link>` keeps filling the card via `after:absolute
after:inset-0` (whole card stays clickable to `/events/{id}`).
- The Bearbeiten `<Link>` is positioned `absolute right-3 top-3 z-10` so it sits
  above the stretched overlay and is independently clickable.
- Styled as a subtle `ghost`, `size="sm"` button — **not** brand accent
  (`#d12020` stays reserved for active/open/accent states per the design system).

## Visual language compliance

- Buttons and pill consume `@bdas/design-system` `Button` variants; no inline
  hex, radius, shadow, or duration.
- Brand accent is not used for these management affordances.

## Testing

- **`nav-items` test** (existing): update the assertion that federal users get an
  Events dropdown — they now get the same flat `Events` link as everyone else.
  Assert no `/admin/events` href is produced by `navItems` for any input.
- **`/events` page**: assert the manage buttons (`Verwalten`, `Neue
Veranstaltung`) render for an authorized viewer (federal, and separately an
  organizer-only viewer) and are absent for an anonymous visitor and a plain
  active member. Assert the per-card `Bearbeiten` link appears only on cards the
  viewer can manage.
- Follow existing test conventions in the events module and `apps/web` (no DB
  mocks for multi-module flows; the page test can stub the list services /
  `getCurrentMember` at the boundary as existing page tests do).

## Files touched

- `apps/web/app/_public/nav-items.ts` (+ its test)
- `apps/web/app/events/page.tsx` (header + `EventCard`)
- Page-level test for `/events` (new or extended, per existing conventions)
