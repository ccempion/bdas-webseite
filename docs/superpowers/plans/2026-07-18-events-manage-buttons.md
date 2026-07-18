# Events Management Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the event "Verwalten" entry point out of the top nav and onto the `/events` page as buttons visible to every authorized user (federal board, local board, or event organizer), plus per-card "Bearbeiten" shortcuts.

**Architecture:** Flatten the Events nav item to a plain link. Add a pure `canManageAny(viewer)` helper next to the existing `viewerFrom` mapper. The `/events` server component uses it to conditionally render header buttons, and uses the events module's existing `canManage(viewer, e)` per card to render a "Bearbeiten" pill. No new data fetching — the page already has `viewer` and the event list.

**Tech Stack:** Next.js 14 App Router (Server Components), TypeScript, `@bdas/design-system` `Button`, `next/link`, Vitest.

## Global Constraints

- Consume `@bdas/design-system` tokens/components only — no inline hex, radius, shadow, or duration (CLAUDE.md §7).
- Brand accent `#d12020` stays reserved for active/open/accent states — management affordances must NOT use it.
- `apps/web` tests run via `vitest run --dir app`, so every test file must live under `apps/web/app/**`; source helpers may live under `apps/web/lib/**` (existing convention: `event-viewer.ts` in `lib/`, its test in `app/lib/`).
- Gruppen navigation, the `/admin/events*` pages, and what `/events` shows the public (published-only) are OUT of scope — do not touch them.
- Run test commands from the `apps/web` directory.

---

### Task 1: Flatten the Events nav item

**Files:**
- Modify: `apps/web/app/_public/nav-items.ts` (the `if (isFlagOn("events"))` block, ~lines 32-43)
- Test: `apps/web/app/_public/nav-items.test.ts`

**Interfaces:**
- Consumes: `navItems({ isFederal?, myGroup?, showFiles? })` — existing signature, unchanged.
- Produces: for all inputs, the Events entry is the leaf `{ label: "Events", href: "/events" }`; `navItems` never emits an `/admin/events` href. `isFederal` remains a parameter (Gruppen still uses it).

- [ ] **Step 1: Write the failing test**

Add to `apps/web/app/_public/nav-items.test.ts` inside the `describe("navItems", …)` block:

```ts
it("renders Events as a flat link for everyone, including federal", () => {
  const prev = process.env["BDAS_FLAG_EVENTS"];
  process.env["BDAS_FLAG_EVENTS"] = "true";

  for (const isFederal of [false, true]) {
    const items = navItems({ isFederal });
    expect(byLabel(items, "Events")).toEqual({ label: "Events", href: "/events" });
  }

  // No management link is ever produced by the nav for events.
  const federal = navItems({ isFederal: true });
  const hrefs = federal.flatMap((i) =>
    "children" in i ? i.children.map((c) => c.href) : [i.href],
  );
  expect(hrefs).not.toContain("/admin/events");

  if (prev === undefined) delete process.env["BDAS_FLAG_EVENTS"];
  else process.env["BDAS_FLAG_EVENTS"] = prev;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `pnpm exec vitest run app/_public/nav-items.test.ts`
Expected: FAIL — federal currently yields an Events object with `children` (a dropdown), so `toEqual({ label: "Events", href: "/events" })` fails and `hrefs` contains `/admin/events`.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/app/_public/nav-items.ts`, replace the events block:

```ts
  if (isFlagOn("events")) {
    items.push(
      isFederal
        ? {
            label: "Events",
            children: [
              { label: "Übersicht", href: "/events" },
              { label: "Verwalten", href: "/admin/events" },
            ],
          }
        : { label: "Events", href: "/events" },
    );
  }
```

with:

```ts
  if (isFlagOn("events")) {
    items.push({ label: "Events", href: "/events" });
  }
```

Leave the `Gruppen` block (which also branches on `isFederal`) and the `isFederal` parameter untouched.

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `pnpm exec vitest run app/_public/nav-items.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_public/nav-items.ts apps/web/app/_public/nav-items.test.ts
git commit -m "feat(web): flatten Events nav item, drop federal-only Verwalten dropdown"
```

---

### Task 2: Add `canManageAny(viewer)` helper

**Files:**
- Modify: `apps/web/lib/event-viewer.ts`
- Test: `apps/web/app/lib/event-viewer.test.ts`

**Interfaces:**
- Consumes: `Viewer` from `@bdas/events-module` (already imported as the return type of `viewerFrom`).
- Produces: `canManageAny(viewer: Viewer): boolean` — true when `viewer.isFederal`, or `viewer.boardGroupIds.length > 0`, or `viewer.organizerGroupIds.length > 0`. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/app/lib/event-viewer.test.ts`:

```ts
import { canManageAny, viewerFrom } from "../../lib/event-viewer";

describe("canManageAny", () => {
  it("is false for anonymous and plain members", () => {
    expect(canManageAny(viewerFrom(null))).toBe(false);
    expect(
      canManageAny(
        viewerFrom({
          user: { id: "usr_1" },
          member: { status: "active", primaryGroupId: "grp_a" },
          grants: [],
        } as never),
      ),
    ).toBe(false);
  });

  it("is true for federal, local board, and event organizers", () => {
    const federal = viewerFrom({
      user: { id: "u" },
      member: { status: "active", primaryGroupId: "grp_a" },
      grants: [{ role: "federal_board", groupId: null }],
    } as never);
    const board = viewerFrom({
      user: { id: "u" },
      member: { status: "active", primaryGroupId: "grp_a" },
      grants: [{ role: "local_board", groupId: "grp_a" }],
    } as never);
    const organizer = viewerFrom({
      user: { id: "u" },
      member: { status: "active", primaryGroupId: "grp_a" },
      grants: [{ role: "event_organizer", groupId: "grp_a" }],
    } as never);
    expect(canManageAny(federal)).toBe(true);
    expect(canManageAny(board)).toBe(true);
    expect(canManageAny(organizer)).toBe(true);
  });
});
```

Note: keep the existing top-of-file `import { viewerFrom } from "../../lib/event-viewer";` — merge `canManageAny` into that import line rather than duplicating it.

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `pnpm exec vitest run app/lib/event-viewer.test.ts`
Expected: FAIL — `canManageAny` is not exported (import error / undefined).

- [ ] **Step 3: Write minimal implementation**

Append to `apps/web/lib/event-viewer.ts`:

```ts
/** Whether this viewer may manage any events at all (federal, local board of
 *  any group, or event organizer of any group). Mirrors the guard used by the
 *  /admin/events pages. */
export function canManageAny(v: Viewer): boolean {
  return v.isFederal || v.boardGroupIds.length > 0 || v.organizerGroupIds.length > 0;
}
```

`Viewer` is already imported in this file (`import { ANON, type Viewer } from "@bdas/events-module";`).

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `pnpm exec vitest run app/lib/event-viewer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/event-viewer.ts apps/web/app/lib/event-viewer.test.ts
git commit -m "feat(web): add canManageAny viewer helper for events management gating"
```

---

### Task 3: `/events` header buttons + per-card "Bearbeiten" pill

**Files:**
- Modify: `apps/web/app/events/page.tsx` (the `EventCard` component and the page `<header>`)

**Interfaces:**
- Consumes: `canManageAny` (Task 2); `canManage` from `@bdas/events-module`; existing `viewer`, `Button` (`@bdas/design-system`), `Link` (`next/link`).
- Produces: no exported surface; this is the final wiring task.

This task is JSX wiring in a server component. The repo does not render RSC pages in unit tests (page logic is tested via extracted pure helpers, which Tasks 1–2 cover), so verification here is typecheck + build + a manual check, not a new test file.

- [ ] **Step 1: Add imports and thread `canEdit` into `EventCard`**

At the top of `apps/web/app/events/page.tsx`, add `Button` to the existing design-system import and add `canManage`:

```ts
import { Alert, Button, Card } from "@bdas/design-system";
import {
  canManage,
  listPastEvents,
  listUpcomingEvents,
  type EventWithCounts,
} from "@bdas/events-module";
```

(Keep the other existing imports as-is.)

Change the `EventCard` signature and wrap it for the stretched-link + overlay pattern so the "Bearbeiten" link is not nested inside the detail `<a>`:

```tsx
function EventCard({ e, past, canEdit }: { e: EventWithCounts; past: boolean; canEdit: boolean }) {
  const full = e.capacity !== null && e.confirmedCount >= e.capacity;
  return (
    <div className="relative">
      <Link href={`/events/${e.id}`} className="block focus:outline-none after:absolute after:inset-0">
        <Card className={past ? "p-5 opacity-70" : "p-5"}>
          <div className="flex items-center gap-2">
            <p className="text-sm text-bdas-ink-muted">{formatDateTime(e.startsAt)}</p>
            {past ? (
              <span className="rounded-bdas-sm bg-bdas-overlay-faint px-2 py-0.5 text-xs text-bdas-ink-muted">
                Vorbei
              </span>
            ) : null}
          </div>
          <h2
            className={
              past
                ? "mt-1 text-lg font-semibold text-bdas-ink-muted"
                : "mt-1 text-lg font-semibold text-bdas-ink"
            }
          >
            {e.title}
          </h2>
          {e.location ? <p className="mt-1 text-sm text-bdas-ink-body">{e.location}</p> : null}
          {past ? null : (
            <p className="mt-2 text-sm text-bdas-ink-muted">
              {e.capacity === null
                ? `${e.confirmedCount} angemeldet`
                : `${e.confirmedCount}/${e.capacity} Plätze${full ? ` · Warteliste ${e.waitlistCount}` : ""}`}
            </p>
          )}
        </Card>
      </Link>
      {canEdit ? (
        <Link href={`/admin/events/${e.id}`} className="absolute right-3 top-3 z-10">
          <Button variant="ghost" size="sm">
            Bearbeiten
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Compute `canManageAny` and render header buttons**

Import the helper — add to the existing event-viewer import line in `page.tsx`:

```ts
import { canManageAny, viewerFrom } from "../../lib/event-viewer";
```

In `EventsPage`, after `const viewer = viewerFrom(me);`, add:

```ts
const canManage_ = canManageAny(viewer);
```

Replace the current header:

```tsx
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-bdas-ink">Veranstaltungen</h1>
        <p className="text-bdas-ink-body">Kommende Veranstaltungen des BDAS.</p>
      </header>
```

with:

```tsx
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-bdas-ink">Veranstaltungen</h1>
          <p className="text-bdas-ink-body">Kommende Veranstaltungen des BDAS.</p>
        </div>
        {canManage_ ? (
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/events/neu">
              <Button variant="primary">Neue Veranstaltung</Button>
            </Link>
            <Link href="/admin/events">
              <Button variant="secondary">Verwalten</Button>
            </Link>
          </div>
        ) : null}
      </header>
```

- [ ] **Step 3: Pass `canEdit` at every `EventCard` call site**

Find each `<EventCard e={...} past={...} />` usage (upcoming and past sections) and add `canEdit={canManage(viewer, e)}`. Example:

```tsx
{upcomingShown.map((e) => (
  <EventCard key={e.id} e={e} past={false} canEdit={canManage(viewer, e)} />
))}
```

```tsx
{pastShown.map((e) => (
  <EventCard key={e.id} e={e} past={true} canEdit={canManage(viewer, e)} />
))}
```

(Match the actual prop names already used at each call site; only add `canEdit`.)

- [ ] **Step 4: Typecheck and build**

Run (from `apps/web`):
```bash
pnpm exec tsc --noEmit
pnpm exec next build
```
Expected: both succeed. If `Button` has no `size` prop, drop `size="sm"` (verify against `core/design-system/src/components/Button.tsx` — it defines `size` on `ButtonProps`; keep `size="sm"` only if the `SIZE` map has an `sm` key, otherwise remove the prop).

- [ ] **Step 5: Run the web test suite**

Run (from `apps/web`): `pnpm test`
Expected: PASS (Tasks 1–2 tests green, nothing else broken).

- [ ] **Step 6: Manual verification**

Start the app and, on `/events`:
- As an anonymous visitor: no header buttons, no "Bearbeiten" pills.
- As an event organizer / local board member: "Neue Veranstaltung" + "Verwalten" buttons top-right; "Bearbeiten" pill only on cards for their group's events; clicking a card still navigates to the public detail; clicking "Bearbeiten" goes to `/admin/events/{id}`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/events/page.tsx
git commit -m "feat(web): surface event management on /events for authorized users"
```

---

## Self-Review

**Spec coverage:**
- Nav flattening → Task 1. ✓
- `canManageAny` authorization predicate → Task 2. ✓
- Header buttons (Neue Veranstaltung primary, Verwalten secondary), authorized-only → Task 3 Step 2. ✓
- Per-card Bearbeiten pill gated by `canManage`, nested-anchor fix via stretched-link → Task 3 Steps 1 & 3. ✓
- Gruppen / admin pages / published-only list untouched → no task modifies them (Global Constraints). ✓
- Design-system tokens, no brand accent → `Button variant="ghost"` pill, `bg-bdas-overlay-faint` reused; no inline hex. ✓
- Tests: nav-items updated (Task 1), gate logic unit-tested (Task 2). RSC render-test for buttons intentionally omitted — repo convention tests extracted logic, not RSC DOM; documented in Task 3 preamble. ✓

**Placeholder scan:** No TBD/TODO; all code blocks concrete. ✓

**Type consistency:** `canManageAny(viewer: Viewer): boolean` defined in Task 2, consumed in Task 3 Step 2. `canEdit: boolean` prop defined on `EventCard` in Task 3 Step 1, passed in Step 3. `canManage` imported from `@bdas/events-module` (its real export). ✓
