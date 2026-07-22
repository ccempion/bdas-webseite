# Landing events calendar — bespoke, brand-native redesign

**Date:** 2026-07-22
**Status:** Approved (design)
**Surface:** `apps/web/app/_public/landing/` (public landing page calendar)

## Problem

The public landing calendar is a Schedule-X island (`@schedule-x/calendar` v4 +
`@schedule-x/react`, themed by `@schedule-x/theme-default`). It reads as
off-brand, heavy, and clunky against the strict BDAS token system, and its month
grid is the wrong shape for a public marketing page whose job is to answer
"what's coming up?". The root cause is bolting a self-themed third-party widget
onto a token-driven design system.

## Decision

Replace Schedule-X with a bespoke, brand-native calendar built from the
`@bdas/design-system` tokens. Swapping to another library (FullCalendar,
react-big-calendar) was rejected: it reintroduces the same "fights our CSS"
problem and adds bundle weight for an app-shaped widget on a marketing surface.

### Locked scope decisions

- **Views:** ship **both** an agenda list (default) and a month grid, with a
  **Liste / Monat** toggle ("scope").
- **RSVP counts:** **not shown** on the public calendar. `confirmedCount` /
  `waitlistCount` are neither rendered nor sent to the client.
- **Expanded card body:** **summary line only** (`summary` field) + a
  "Zum Event →" link. Full `descriptionMd` stays on the event detail page.
- **Theme:** light only — the BDAS tokens define no dark variants. A deliberate
  single-theme commitment, matching the live product.

## Non-goals

- No new module, tables, migration, or feature flag (stays behind the existing
  `events` + `public_shell` flags at `app/page.tsx`).
- No changes to the events module public surface or data model.
- No week/day views, drag-drop, or event editing. This is a read-only public
  surface.
- No infinite month navigation history — the list is the primary experience;
  the grid defaults to the current month and past months are simply empty.

## Architecture

All app-layer, inside `apps/web/app/_public/landing/`. Consumes only the public
surfaces of `@bdas/events-module`, `@bdas/groups`, and `@bdas/design-system`.
No cross-module deep imports; no modular-rule impact.

### Components

- **`KalenderBlock.tsx`** *(server component — shape unchanged).* Fetches
  `listUpcomingEvents(db, viewer)` + `listGroups(db, { status: "active" })` in
  parallel (visibility filtering already runs server-side in
  `listUpcomingEvents`), maps to the wire type via `toCalendarEvents`, and
  renders `<Section title="Veranstaltungen" intro="Alle Termine auf einen Blick.">`
  wrapping `<EventCalendar>`.

- **`EventCalendar.tsx`** *(client island — rewritten).* Owns two pieces of
  state: `filter` (`"all" | "federal" | <groupId>`) and `view`
  (`"list" | "month"`). Renders the **scope bar** — group `FilterChip`s (reused
  as-is from `@bdas/design-system`; active chip is the solid-red fill the
  component already ships) plus a segmented **Liste / Monat** toggle — then
  delegates to `AgendaList` or `MonthGrid` with the filtered events. Group
  filtering is the existing `useMemo` predicate.

- **`AgendaList.tsx`** *(client).* Takes filtered events (already sorted
  ascending by start), groups them under month labels (e.g. "September 2026"),
  and renders an `EventAccordion` per event. Empty state: a quiet
  "Keine anstehenden Termine." line.

- **`EventAccordion.tsx`** *(client).* Built on the canonical
  `details.bdas-accordion` class from `globals.css` (which already provides the
  hover lift, `[open]` red left border + halo, summary→red, `::after` `+`→`×`
  rotation, and `bdas-fade-slide-down` body). Adds calendar-specific summary
  content: a date badge (day number + month abbrev), title, `time · location`
  meta line, and a group tag (federal events tagged "Bundesweit" in red).
  Expanded body = summary line + "Zum Event →" link to `/events/[id]`.

- **`MonthGrid.tsx`** *(client).* Monday-first month grid with prev/next month
  navigation (local state, initialised to the current Berlin month), a "today"
  marker, and event pills per day (collapsing to a dot on mobile). Clicking a
  pill navigates to `/events/[id]`. Grid layout math comes from a pure helper.

- **`month-grid.ts`** *(pure, testable).* `buildMonthWeeks(year, month, events)`
  → weeks of day cells, each tagged with its date, in-month flag, and bucketed
  events. Fed by the wire-format date strings (trivial `YYYY-MM-DD` bucketing),
  so it needs no timezone logic of its own.

### Data flow / wire type

`calendar-events.ts` keeps emitting plain serializable strings across the
RSC boundary. The `CalendarEvent` wire type is extended:

```ts
export type CalendarEvent = {
  readonly id: string;
  readonly title: string;
  readonly start: string;   // "YYYY-MM-DD HH:mm", Europe/Berlin wall-clock
  readonly end: string;     // same format
  readonly groupId: string | null;
  readonly summary: string | null;        // new — expanded body text
  readonly location: string | null;       // new — derived, see below
};
```

`location` is derived in `toCalendarEvents`: prefer `locationName`
(+ `locationAddress` when present), fall back to the legacy `location` field,
else `null` (rendered as "Online"/omitted at the component's discretion).
`confirmedCount` / `waitlistCount` are intentionally dropped from the payload.

The Berlin wall-clock formatting (`fmt` via `berlinParts`) is retained
unchanged. The Schedule-X `Temporal.ZonedDateTime` conversion in
`EventCalendar.tsx` is removed entirely.

### Styling

Tailwind utilities from the `@bdas/design-system` preset
(`bg-bdas-surface`, `text-bdas-red`, `text-bdas-ink`, `rounded-bdas`,
`rounded-bdas-sm`, `shadow-bdas-card`, `shadow-bdas-red-glow`,
`animate-bdas-fade-slide-down`, `duration-bdas-*`, etc.). **No ad-hoc hex,
radius, shadow, or duration** (§7). If a needed utility is missing from the
preset, raise it for an addition rather than inlining a value. The date badge,
segmented view toggle, and month-grid cells all resolve to existing token
values (verified against the approved mockup, which used token values only).

### Accessibility

- Scope bar: `role="group"` + `aria-label`; `FilterChip` already sets
  `aria-pressed`; the view toggle mirrors that with `aria-pressed`.
- `EventAccordion` uses native `<details>`/`<summary>` semantics; the `+`/`×`
  glyph is decorative (`aria-hidden`).
- Visible keyboard focus on chips, toggle, accordions, and event links.
- The body fade honors `prefers-reduced-motion` (already handled by the shared
  accordion CSS / preset conventions).

### Cleanup

- Remove deps: `@schedule-x/calendar`, `@schedule-x/react`,
  `@schedule-x/theme-default`, and `temporal-polyfill` (confirmed sole importer
  is `EventCalendar.tsx`).
- Remove the `@schedule-x/theme-default/dist/index.css` import and the
  `temporal-polyfill/global` import.

## Testing

- **`calendar-events.test.ts`** — extend for the new mapping: `summary`
  passthrough, `location` derivation (name+address, legacy fallback, null),
  and the retained Berlin wall-clock formatting.
- **`month-grid.test.ts`** *(new)* — unit-test `buildMonthWeeks`: Monday-first
  ordering, leading/trailing out-of-month days, event bucketing onto the right
  day, month boundaries.
- **§23 events E2E** (`e2e/events.e2e.ts`) — keep green; the landing calendar
  must still render and event links must still navigate to `/events/[id]`.
  Preserve stable link/test hooks when replacing the island.
- Component render sanity for `EventCalendar` (filter + view toggle switching)
  at the existing app test tier.

## Rollout

No flag change. The rewrite lands behind the already-live `events` +
`public_shell` gates. It is a like-for-like replacement of the island the page
already renders, so no data or route changes are required.
