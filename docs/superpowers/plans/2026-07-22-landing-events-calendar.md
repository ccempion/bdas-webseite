# Landing Events Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the off-brand Schedule-X landing calendar with a bespoke, brand-native events calendar (agenda list + month grid) built entirely from the `@bdas/design-system` tokens.

**Architecture:** All changes live in `apps/web/app/_public/landing/`. A server component (`KalenderBlock`) fetches events + groups and passes a serializable wire type into a client island (`EventCalendar`) that owns group-filter and list/month view state and delegates to `AgendaList` (built on the shared `.bdas-accordion` idiom) or `MonthGrid` (fed by a pure `buildMonthWeeks` helper). No new module, tables, migration, or feature flag.

**Tech Stack:** TypeScript, Next.js 14 App Router (RSC + client islands), Tailwind via the `@bdas/design-system` preset, `next/link` with typed routes, Vitest (pure-logic tests only — the web app has no component-test infra).

## Global Constraints

- **Design tokens only.** No raw hex, radius, shadow, or duration. Use preset utilities: `text-bdas-red` / `text-bdas-ink` / `text-bdas-ink-body` / `text-bdas-ink-muted`, `bg-bdas-surface` / `bg-bdas-surface-hover` / `bg-bdas-red`, `border-bdas-soft` / `border-bdas-strong` / `border-bdas-red`, `rounded-bdas` / `rounded-bdas-sm` / `rounded-bdas-pill`, `shadow-bdas-card` / `shadow-bdas-lift-sm` / `shadow-bdas-red-glow`, `duration-bdas-quick` / `-soft` / `-slow`, `ease-bdas`. If a needed utility is missing, raise it — do not inline a value (CLAUDE.md §7).
- **No cross-module deep imports.** Consume only public surfaces: `@bdas/design-system`, `@bdas/events-module`, `@bdas/groups`.
- **Wire format unchanged:** event `start`/`end` cross the RSC boundary as `"YYYY-MM-DD HH:mm"` Europe/Berlin wall-clock strings.
- **No RSVP counts** in the public payload or UI. **Expanded card body = `summary` line + link only.**
- **Light theme only** (BDAS tokens define no dark variants).
- Event links always point to `/events/${id}` (typed route — cast `as Route`).
- Tests run from `apps/web` via `pnpm exec vitest run <path>` (script: `vitest run --dir app`).

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch**

We are on `main`; branch first (CLAUDE.md working agreement, one module per PR).

```bash
git checkout -b feat/landing-calendar
```

---

### Task 1: `buildMonthWeeks` pure helper

The month grid's layout math, isolated as a pure, timezone-free function so it is unit-testable. Buckets events onto days by the date prefix of their `start` string.

**Files:**
- Create: `apps/web/app/_public/landing/month-grid.ts`
- Test: `apps/web/app/_public/landing/month-grid.test.ts`

**Interfaces:**
- Consumes: `CalendarEvent` from `./calendar-events` (extended in Task 2; for this task only `.start` and `.id`/`.groupId` are read, all already present on the current type).
- Produces:
  ```ts
  export type DayCell = {
    readonly date: string;        // "YYYY-MM-DD"
    readonly day: number;         // 1..31
    readonly inMonth: boolean;
    readonly events: readonly CalendarEvent[];
  };
  export function buildMonthWeeks(
    year: number,
    month: number,                // 1..12
    events: readonly CalendarEvent[],
  ): DayCell[][];
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_public/landing/month-grid.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildMonthWeeks } from "./month-grid";
import type { CalendarEvent } from "./calendar-events";

function ev(id: string, start: string, groupId: string | null = null): CalendarEvent {
  return { id, title: id, start, end: start, groupId, summary: null, location: null };
}

describe("buildMonthWeeks", () => {
  // September 2026: the 1st is a Tuesday, so Monday-first grids get one
  // leading cell (Mon Aug 31). 30 days + 1 lead = 31 cells => 5 weeks.
  it("lays out September 2026 as 5 Monday-first weeks", () => {
    const weeks = buildMonthWeeks(2026, 9, []);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0]![0]).toMatchObject({ date: "2026-08-31", day: 31, inMonth: false });
    expect(weeks[0]![1]).toMatchObject({ date: "2026-09-01", day: 1, inMonth: true });
    expect(weeks[4]![6]).toMatchObject({ date: "2026-10-04", day: 4, inMonth: false });
  });

  it("buckets an event onto its start date", () => {
    const weeks = buildMonthWeeks(2026, 9, [ev("e1", "2026-09-14 10:00")]);
    const cell = weeks.flat().find((c) => c.date === "2026-09-14");
    expect(cell!.events.map((e) => e.id)).toEqual(["e1"]);
    // no other cell carries it
    expect(weeks.flat().filter((c) => c.events.length > 0)).toHaveLength(1);
  });

  it("keeps events off out-of-month days", () => {
    const weeks = buildMonthWeeks(2026, 9, [ev("e1", "2026-08-31 09:00")]);
    const leading = weeks[0]![0]!;
    expect(leading.date).toBe("2026-08-31");
    expect(leading.events).toHaveLength(1); // bucketed onto the visible lead cell
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run app/_public/landing/month-grid.test.ts`
Expected: FAIL — cannot resolve `./month-grid` / `buildMonthWeeks is not a function`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/_public/landing/month-grid.ts`:

```ts
import type { CalendarEvent } from "./calendar-events";

export type DayCell = {
  /** "YYYY-MM-DD" */
  readonly date: string;
  readonly day: number;
  readonly inMonth: boolean;
  readonly events: readonly CalendarEvent[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const DAY_MS = 86_400_000;

/**
 * Monday-first weeks for the given month (`month` is 1-12). Events are bucketed
 * onto a day by the date prefix of their `start` ("YYYY-MM-DD HH:mm"), so no
 * timezone math is needed — the strings are already Europe/Berlin wall-clock.
 * Iteration runs in UTC so the calendar arithmetic is free of local-TZ drift.
 * Leading/trailing cells fill out partial weeks and carry `inMonth: false`.
 */
export function buildMonthWeeks(
  year: number,
  month: number,
  events: readonly CalendarEvent[],
): DayCell[][] {
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = e.start.slice(0, 10);
    const bucket = byDate.get(key);
    if (bucket) bucket.push(e);
    else byDate.set(key, [e]);
  }

  const first = new Date(Date.UTC(year, month - 1, 1));
  const leading = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((leading + daysInMonth) / 7);
  const start = new Date(Date.UTC(year, month - 1, 1 - leading));

  const cells: DayCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const date = iso(y, m, day);
    cells.push({ date, day, inMonth: m === month && y === year, events: byDate.get(date) ?? [] });
  }

  const out: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
  return out;
}
```

> Note: this imports the extended `CalendarEvent` (with `summary`/`location`). The test's `ev()` factory already supplies those fields, so this task compiles standalone; Task 2 adds them to the real type. If running strictly in order, Task 1's test factory defines the shape it needs.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run app/_public/landing/month-grid.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_public/landing/month-grid.ts apps/web/app/_public/landing/month-grid.test.ts
git commit -m "feat(web): pure month-grid week builder for landing calendar"
```

---

### Task 2: Extend the `CalendarEvent` wire type + mapping

Add `summary` and a derived `location` to the wire type; drop nothing else. The Berlin wall-clock `fmt` logic is unchanged.

**Files:**
- Modify: `apps/web/app/_public/landing/calendar-events.ts`
- Test: `apps/web/app/_public/landing/calendar-events.test.ts` (update existing)

**Interfaces:**
- Consumes: `EventWithCounts` from `@bdas/events-module` (fields used: `id`, `title`, `startsAt`, `endsAt`, `groupId`, `summary`, `locationName`, `locationAddress`, `location`).
- Produces: extended `CalendarEvent` (adds `readonly summary: string | null; readonly location: string | null;`) and unchanged `toCalendarEvents(events): CalendarEvent[]`.

- [ ] **Step 1: Update the failing test**

In `apps/web/app/_public/landing/calendar-events.test.ts`, replace the first test's assertion object and add mapping cases. The existing `base` object already has `summary: null`, `locationName: null`, `locationAddress: null`, `location: null`.

Change the first test to:

```ts
  it("formats start/end and carries summary + location", () => {
    const [ev] = toCalendarEvents([base]);
    expect(ev).toEqual({
      id: "ev-1",
      title: "Bundeskonferenz",
      start: "2026-09-05 14:30",
      end: "2026-09-05 18:00",
      groupId: null,
      summary: null,
      location: null,
    });
  });
```

Add after the existing tests, inside the `describe`:

```ts
  it("passes summary through", () => {
    const [ev] = toCalendarEvents([{ ...base, summary: "Kurzbeschreibung" }]);
    expect(ev!.summary).toBe("Kurzbeschreibung");
  });

  it("derives location from name + address", () => {
    const [ev] = toCalendarEvents([
      { ...base, locationName: "Rathaus", locationAddress: "Marktplatz 1" },
    ]);
    expect(ev!.location).toBe("Rathaus, Marktplatz 1");
  });

  it("uses location name alone when address is absent", () => {
    const [ev] = toCalendarEvents([{ ...base, locationName: "Online" }]);
    expect(ev!.location).toBe("Online");
  });

  it("falls back to the legacy location field", () => {
    const [ev] = toCalendarEvents([{ ...base, location: "Berlin" }]);
    expect(ev!.location).toBe("Berlin");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run app/_public/landing/calendar-events.test.ts`
Expected: FAIL — `toEqual` mismatch (missing `summary`/`location` on result) and new cases fail.

- [ ] **Step 3: Update the implementation**

In `apps/web/app/_public/landing/calendar-events.ts`, extend the type:

```ts
export type CalendarEvent = {
  readonly id: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly groupId: string | null;
  readonly summary: string | null;
  readonly location: string | null;
};
```

Add a helper above `toCalendarEvents`:

```ts
function locationOf(e: EventWithCounts): string | null {
  if (e.locationName) {
    return e.locationAddress ? `${e.locationName}, ${e.locationAddress}` : e.locationName;
  }
  return e.location ?? null;
}
```

Update the map body:

```ts
export function toCalendarEvents(events: ReadonlyArray<EventWithCounts>): CalendarEvent[] {
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    start: fmt(e.startsAt),
    end: fmt(e.endsAt ?? new Date(e.startsAt.getTime() + HOUR_MS)),
    groupId: e.groupId,
    summary: e.summary,
    location: locationOf(e),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run app/_public/landing/calendar-events.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_public/landing/calendar-events.ts apps/web/app/_public/landing/calendar-events.test.ts
git commit -m "feat(web): carry summary + location on landing calendar wire type"
```

---

### Task 3: `EventAccordion` component

One event as a `<details>` card built on the shared `.bdas-accordion` idiom (which already supplies hover lift, `[open]` red border/halo, `+`→`×`, and the body fade). No unit test — the web app has no component-test tier; covered by the §23 E2E (Task 8) and visual check.

**Files:**
- Create: `apps/web/app/_public/landing/EventAccordion.tsx`

**Interfaces:**
- Consumes: `CalendarEvent` from `./calendar-events`.
- Produces: `export function EventAccordion({ event, groupLabel }: { event: CalendarEvent; groupLabel: string }): JSX.Element`.

- [ ] **Step 1: Write the component**

Create `apps/web/app/_public/landing/EventAccordion.tsx`:

```tsx
import Link from "next/link";
import type { Route } from "next";

import type { CalendarEvent } from "./calendar-events";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

/** `start` is "YYYY-MM-DD HH:mm" Europe/Berlin wall-clock. */
function parseStart(start: string): { day: number; monthAbbr: string; time: string } {
  const [date, time] = start.split(" ");
  const [, month, day] = date!.split("-").map(Number);
  return { day: day!, monthAbbr: MONTHS_SHORT[month! - 1]!, time: time! };
}

export function EventAccordion({
  event,
  groupLabel,
}: {
  event: CalendarEvent;
  groupLabel: string;
}) {
  const { day, monthAbbr, time } = parseStart(event.start);
  const isFederal = event.groupId === null;

  return (
    <details className="bdas-accordion">
      <summary>
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex w-12 shrink-0 flex-col items-center rounded-bdas-sm bg-bdas-surface-hover py-1.5">
            <span className="text-xl font-bold leading-none text-bdas-ink tabular-nums">{day}</span>
            <span className="mt-0.5 text-xs uppercase tracking-wide text-bdas-ink-muted">{monthAbbr}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{event.title}</span>
            <span className="mt-0.5 block text-sm font-normal text-bdas-ink-muted">
              {time} Uhr{event.location ? ` · ${event.location}` : ""}
            </span>
          </span>
          <span
            className={
              "shrink-0 rounded-bdas-pill border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide " +
              (isFederal ? "border-bdas-red text-bdas-red" : "border-bdas-strong text-bdas-ink-muted")
            }
          >
            {groupLabel}
          </span>
        </span>
      </summary>
      <div>
        {event.summary ? <p className="mb-3">{event.summary}</p> : null}
        <Link
          href={`/events/${event.id}` as Route}
          className="inline-flex items-center gap-1.5 rounded-bdas-pill bg-bdas-red px-4 py-1.5 text-sm font-semibold text-white"
        >
          Zum Event →
        </Link>
      </div>
    </details>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS (no type errors in the new file).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/_public/landing/EventAccordion.tsx
git commit -m "feat(web): brand-native event accordion card"
```

---

### Task 4: `AgendaList` component

Groups the (already ascending-sorted) filtered events under month labels and renders an `EventAccordion` per event. Spacing between cards comes from `.bdas-accordion`'s own `margin-bottom` — do **not** add a `gap` container around them.

**Files:**
- Create: `apps/web/app/_public/landing/AgendaList.tsx`

**Interfaces:**
- Consumes: `CalendarEvent` from `./calendar-events`; `EventAccordion` from `./EventAccordion`.
- Produces: `export function AgendaList({ events, groupLabelFor }: { events: CalendarEvent[]; groupLabelFor: (e: CalendarEvent) => string }): JSX.Element`.

- [ ] **Step 1: Write the component**

Create `apps/web/app/_public/landing/AgendaList.tsx`:

```tsx
import type { CalendarEvent } from "./calendar-events";
import { EventAccordion } from "./EventAccordion";

const MONTHS_LONG = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** `start` is "YYYY-MM-DD ..."; returns e.g. "September 2026". */
function monthLabel(start: string): string {
  const [y, m] = start.slice(0, 7).split("-").map(Number);
  return `${MONTHS_LONG[m! - 1]} ${y}`;
}

export function AgendaList({
  events,
  groupLabelFor,
}: {
  events: CalendarEvent[];
  groupLabelFor: (e: CalendarEvent) => string;
}) {
  if (events.length === 0) {
    return <p className="text-bdas-ink-body">Keine anstehenden Termine.</p>;
  }

  const groups: { label: string; items: CalendarEvent[] }[] = [];
  for (const ev of events) {
    const label = monthLabel(ev.start);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(ev);
    else groups.push({ label, items: [ev] });
  }

  return (
    <div>
      {groups.map((g) => (
        <div key={g.label}>
          <h3 className="mb-2.5 mt-5 px-1 text-xs font-bold uppercase tracking-wider text-bdas-ink-muted first:mt-0">
            {g.label}
          </h3>
          {g.items.map((ev) => (
            <EventAccordion key={ev.id} event={ev} groupLabel={groupLabelFor(ev)} />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/_public/landing/AgendaList.tsx
git commit -m "feat(web): agenda list grouped by month for landing calendar"
```

---

### Task 5: `MonthGrid` component

Monday-first month grid with prev/next navigation, a "today" marker (Europe/Berlin), and event pills that link to the event (collapsing to a dot on mobile). Consumes `buildMonthWeeks`.

**Files:**
- Create: `apps/web/app/_public/landing/MonthGrid.tsx`

**Interfaces:**
- Consumes: `buildMonthWeeks` from `./month-grid`; `CalendarEvent` from `./calendar-events`; `berlinParts` from `../../lib/datetime`.
- Produces: `export function MonthGrid({ events }: { events: CalendarEvent[] }): JSX.Element`.

- [ ] **Step 1: Write the component**

Create `apps/web/app/_public/landing/MonthGrid.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { berlinParts } from "../../lib/datetime";
import type { CalendarEvent } from "./calendar-events";
import { buildMonthWeeks } from "./month-grid";

const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS_LONG = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function berlinTodayIso(): string {
  const p = berlinParts(new Date());
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p["year"]}-${pad(p["month"]!)}-${pad(p["day"]!)}`;
}

export function MonthGrid({ events }: { events: CalendarEvent[] }) {
  const today = berlinTodayIso();
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));

  const shift = (delta: number) =>
    setCursor((c) => {
      const idx = c.year * 12 + (c.month - 1) + delta;
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    });

  const weeks = buildMonthWeeks(cursor.year, cursor.month, events);
  const navBtn =
    "flex h-8 w-8 items-center justify-center rounded-full border border-bdas-strong bg-bdas-surface text-bdas-ink-body transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover";

  return (
    <div className="rounded-bdas border border-bdas-soft bg-bdas-surface p-2 shadow-bdas-card">
      <div className="flex items-center justify-between px-2.5 pb-3 pt-2">
        <button type="button" onClick={() => shift(-1)} aria-label="Vorheriger Monat" className={navBtn}>
          ‹
        </button>
        <h3 className="text-base font-bold text-bdas-ink">
          {MONTHS_LONG[cursor.month - 1]} {cursor.year}
        </h3>
        <button type="button" onClick={() => shift(1)} aria-label="Nächster Monat" className={navBtn}>
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {DOW.map((d) => (
          <div key={d} className="py-1.5 text-center text-xs font-bold uppercase tracking-wide text-bdas-ink-muted">
            {d}
          </div>
        ))}

        {weeks.flat().map((cell) => (
          <div
            key={cell.date}
            className="flex min-h-[58px] flex-col gap-0.5 rounded-bdas-sm p-1.5 transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover sm:min-h-[78px]"
          >
            <span
              className={
                cell.date === today
                  ? "inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-bdas-red text-xs font-bold tabular-nums text-white"
                  : "text-sm tabular-nums " +
                    (cell.inMonth ? "text-bdas-ink-body" : "text-bdas-ink-muted opacity-50")
              }
            >
              {cell.day}
            </span>

            {/* Mobile: a dot when the day has any event */}
            {cell.events.length > 0 ? (
              <span
                className={
                  "mt-auto h-1.5 w-1.5 rounded-full sm:hidden " +
                  (cell.events.some((e) => e.groupId === null) ? "bg-bdas-red" : "bg-bdas-ink-muted")
                }
                aria-hidden="true"
              />
            ) : null}

            {/* Desktop: full event pills */}
            {cell.events.map((ev) => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}` as Route}
                className={
                  "hidden truncate rounded-bdas-sm border-l-2 bg-bdas-surface-hover px-1.5 py-0.5 text-xs font-semibold sm:block " +
                  (ev.groupId === null ? "border-bdas-red text-bdas-red" : "border-bdas-strong text-bdas-ink-body")
                }
              >
                {ev.title}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/_public/landing/MonthGrid.tsx
git commit -m "feat(web): brand-native month grid for landing calendar"
```

---

### Task 6: Rewrite `EventCalendar` island

Replace the Schedule-X island with the scope bar (group `FilterChip`s + Liste/Monat toggle) that delegates to `AgendaList` / `MonthGrid`. Removes all Schedule-X and Temporal code.

**Files:**
- Modify (full rewrite): `apps/web/app/_public/landing/EventCalendar.tsx`

**Interfaces:**
- Consumes: `FilterChip` from `@bdas/design-system`; `CalendarEvent` from `./calendar-events`; `AgendaList`, `MonthGrid`.
- Produces: `export type GroupOption = { id: string; name: string };` and `export function EventCalendar({ events, groups }: { events: CalendarEvent[]; groups: GroupOption[] }): JSX.Element` (unchanged signature — `KalenderBlock` needs no change).

- [ ] **Step 1: Replace the file contents**

Overwrite `apps/web/app/_public/landing/EventCalendar.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";

import { FilterChip } from "@bdas/design-system";

import type { CalendarEvent } from "./calendar-events";
import { AgendaList } from "./AgendaList";
import { MonthGrid } from "./MonthGrid";

export type GroupOption = { id: string; name: string };
type Filter = "all" | "federal" | string;
type View = "list" | "month";

export function EventCalendar({
  events,
  groups,
}: {
  events: CalendarEvent[];
  groups: GroupOption[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("list");

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "federal") return events.filter((e) => e.groupId === null);
    return events.filter((e) => e.groupId === filter);
  }, [events, filter]);

  const groupsWithEvents = groups.filter((g) => events.some((e) => e.groupId === g.id));
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const groupLabelFor = (e: CalendarEvent) =>
    e.groupId === null ? "Bundesweit" : groupName.get(e.groupId) ?? "Gruppe";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Veranstaltungen filtern">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            Alle
          </FilterChip>
          <FilterChip active={filter === "federal"} onClick={() => setFilter("federal")}>
            Bundesweit
          </FilterChip>
          {groupsWithEvents.map((g) => (
            <FilterChip key={g.id} active={filter === g.id} onClick={() => setFilter(g.id)}>
              {g.name}
            </FilterChip>
          ))}
        </div>

        <div
          className="inline-flex rounded-bdas-pill border border-bdas-strong bg-bdas-surface p-0.5"
          role="group"
          aria-label="Ansicht"
        >
          {(["list", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={
                "rounded-bdas-pill px-4 py-1 text-sm font-semibold transition-colors duration-bdas-quick ease-bdas " +
                (view === v ? "text-bdas-red" : "text-bdas-ink-muted hover:text-bdas-ink-body")
              }
            >
              {v === "list" ? "Liste" : "Monat"}
            </button>
          ))}
        </div>
      </div>

      {view === "list" ? (
        <AgendaList events={filtered} groupLabelFor={groupLabelFor} />
      ) : (
        <MonthGrid events={filtered} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run the landing unit tests**

Run: `cd apps/web && pnpm exec vitest run app/_public/landing`
Expected: PASS (month-grid + calendar-events suites).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_public/landing/EventCalendar.tsx
git commit -m "feat(web): bespoke scope-bar calendar island (list + month)"
```

---

### Task 7: Remove Schedule-X + Temporal

Drop the now-unused dependencies and the leftover Schedule-X theme override in global CSS.

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Remove the CSS override block**

In `apps/web/app/globals.css`, delete the entire block that begins with the comment `/* Schedule-X → BDAS design tokens.` (immediately after the `.bdas-accordion` rules, ~line 92) through the end of that Schedule-X override section. Leave the `.bdas-accordion` rules and `@keyframes bdas-fade-slide-down` intact.

- [ ] **Step 2: Remove dependencies**

In `apps/web/package.json`, delete these four `dependencies` lines:

```
"@schedule-x/calendar": "^4.6.0",
"@schedule-x/react": "^4.1.0",
"@schedule-x/theme-default": "^4.6.0",
"temporal-polyfill": "0.3.0"
```

Then reinstall the lockfile:

```bash
pnpm install
```

- [ ] **Step 3: Verify nothing still imports them**

Run: `grep -rn "schedule-x\|temporal-polyfill" apps/web/app apps/web/package.json`
Expected: no matches.

- [ ] **Step 4: Build to confirm the app compiles without them**

Run: `cd apps/web && pnpm build`
Expected: build succeeds; landing page renders the calendar.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/app/globals.css pnpm-lock.yaml
git commit -m "chore(web): drop schedule-x + temporal-polyfill from landing calendar"
```

---

### Task 8: Verify the §23 events E2E still passes

The `e2e/events.e2e.ts` acceptance job renders the landing calendar and checks event create/redirect flows. Event links still point to `/events/${id}`, so it should pass unchanged — confirm, and adjust only if a selector the E2E relied on was Schedule-X-specific.

**Files:**
- Read: `e2e/events.e2e.ts` (adjust selectors only if it asserted Schedule-X DOM)

- [ ] **Step 1: Read the E2E to see what it asserts about the landing calendar**

Run: `grep -n "calendar\|landing\|Veranstaltung\|/events/\|schedule" e2e/events.e2e.ts`

- [ ] **Step 2: Run the events E2E**

Run the project's E2E command for the events spec (per `e2e/` README / CI config, e.g. `pnpm --filter e2e test events` or the Playwright invocation used in CI).
Expected: PASS. If a selector was Schedule-X-specific (e.g. `.sx__event`), update it to target the new accordion (`details.bdas-accordion`) or the event link `a[href^="/events/"]`, then re-run.

- [ ] **Step 3: Commit (only if the E2E file changed)**

```bash
git add e2e/events.e2e.ts
git commit -m "test(e2e): retarget landing calendar selectors to bespoke calendar"
```

---

## Self-Review

**Spec coverage:**
- Both views (list default + month toggle) → Tasks 4, 5, 6. ✅
- No RSVP counts (payload + UI) → Task 2 drops them from the wire type; no component renders counts. ✅
- Summary-only expanded body → Task 3 (`event.summary` + link). ✅
- Bespoke, token-only styling → Tasks 3–6 use preset utilities; global constraint enforces it. ✅
- Reuse shared `.bdas-accordion` idiom → Task 3. ✅
- Pure, testable month math → Task 1. ✅
- Berlin wall-clock wire format retained → Task 2 keeps `fmt`; Task 1/3/4 parse the string. ✅
- Light theme only → no dark variants introduced. ✅
- Remove Schedule-X + Temporal → Task 7. ✅
- Tests: mapping + month-grid unit tests (Tasks 1–2); §23 E2E kept green (Task 8). ✅
- No new module/table/migration/flag → nothing in the plan adds any. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected output. ✅

**Type consistency:** `CalendarEvent` (with `summary`/`location`) is defined in Task 2 and consumed identically in Tasks 1, 3, 4, 5. `EventAccordion` prop `groupLabel` (Task 3) matches the value passed by `AgendaList` via `groupLabelFor` (Task 4), which matches `groupLabelFor` produced by `EventCalendar` (Task 6). `buildMonthWeeks(year, month, events)` signature is identical in Tasks 1 and 5. `GroupOption` and `EventCalendar` signature unchanged, so `KalenderBlock` needs no edit. ✅
