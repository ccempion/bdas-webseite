# Meine Gruppe Nav + Events Group Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give signed-in members a "Meine Gruppe" nav dropdown + a "Dateien" nav item, and add a multi-select group filter plus a past-events view to `/events`.

**Architecture:** Nav additions are computed in the pure `navItems()` factory (flag/param driven) and wired in the `PublicHeader` server component. The events filter is fully server-rendered: the page derives filter chips from the fetched event set and filters in JS; past events come from a new `listPastEvents` module function. Chips and the past toggle are plain `<Link>`s carrying URL params — no client JS.

**Tech Stack:** Next.js 14 App Router (Server Components), TypeScript, Drizzle ORM, Vitest, Tailwind via `@bdas/design-system` tokens.

## Global Constraints

- **Design tokens only** — no inline hex/radius/shadow/duration. Use token utility classes (`rounded-bdas-pill`, `bg-bdas-red`, `text-bdas-ink-muted`, `border-bdas-soft`, `duration-bdas-quick`, `ease-bdas`, etc.), matching `core/design-system/src/components/FilterChip.tsx`.
- **Module boundary (CLAUDE.md §1)** — `apps/web` consumes `@bdas/events-module`, `@bdas/groups`, `@bdas/members`, `@bdas/feature-flags`, `@bdas/db` only through their public `index.ts`. No deep imports.
- **Feature flags** — `isFlagOn(name)` reads `BDAS_FLAG_<NAME_UPPER>`. `/dateien` requires `files`; `/events` and `/gruppen/[slug]` require `events` / `groups`.
- **German UI copy.** Labels used here verbatim: `Meine Gruppe`, `Übersicht`, `Events`, `Dateien`, `Alle`, `Bundesweit`, `Vergangene anzeigen`, `Nur kommende`, `Kommende`, `Vergangene`, `Vorbei`.
- **Tests ship with code.** Web tests run under `app/` (`vitest run --dir app`); module tests under `src/` and use real Postgres (skip when DB unreachable).
- **Commit after each task.** Branch is `feat/member-nav-and-events-filter` (already checked out).

---

## File Structure

- `apps/web/app/_public/nav-items.ts` — extend `navItems()` with `myGroup` + `showFiles`; add "Meine Gruppe" dropdown and "Dateien" leaf. (Task 1)
- `apps/web/app/_public/nav-items.test.ts` — new unit test for the factory. (Task 1)
- `apps/web/app/_public/PublicHeader.tsx` — resolve the member's group slug + compute `showFiles`, pass to `navItems()`. (Task 2)
- `modules/events/src/services/list.ts` — add `listPastEvents` (shared internal query helper). (Task 3)
- `modules/events/src/index.ts` — export `listPastEvents`. (Task 3)
- `modules/events/README.md` — document `listPastEvents`. (Task 3)
- `modules/events/src/services/list.test.ts` — new integration test. (Task 3)
- `apps/web/app/events/event-filter.ts` — pure filter helpers. (Task 4)
- `apps/web/app/events/event-filter.test.ts` — unit test. (Task 4)
- `apps/web/app/events/EventFilterBar.tsx` — server component, chip bar + past toggle. (Task 5)
- `apps/web/app/events/page.tsx` — wire filter + past sections + "Vorbei" badge. (Task 6)

---

## Task 1: Nav factory — "Meine Gruppe" dropdown + "Dateien" leaf

**Files:**

- Modify: `apps/web/app/_public/nav-items.ts`
- Test: `apps/web/app/_public/nav-items.test.ts` (create)

**Interfaces:**

- Consumes: nothing new.
- Produces: `navItems(opts?: { isFederal?: boolean; myGroup?: { slug: string }; showFiles?: boolean }): NavItem[]`. When `myGroup` is set, appends `{ label: "Meine Gruppe", children: [{ label: "Übersicht", href: "/gruppen/<slug>" }, { label: "Events", href: "/events?groups=<slug>" }] }`. When `showFiles` is true, appends `{ label: "Dateien", href: "/dateien" }`. Both are placed after the existing "Gruppen" item.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_public/nav-items.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { navItems, type NavItem } from "./nav-items";

function byLabel(items: NavItem[], label: string): NavItem | undefined {
  return items.find((i) => i.label === label);
}

describe("navItems", () => {
  it("omits Meine Gruppe and Dateien by default", () => {
    const items = navItems();
    expect(byLabel(items, "Meine Gruppe")).toBeUndefined();
    expect(byLabel(items, "Dateien")).toBeUndefined();
  });

  it("adds a Meine Gruppe dropdown when myGroup is given", () => {
    const items = navItems({ myGroup: { slug: "koeln" } });
    const mg = byLabel(items, "Meine Gruppe");
    expect(mg).toBeDefined();
    expect(mg).toMatchObject({
      label: "Meine Gruppe",
      children: [
        { label: "Übersicht", href: "/gruppen/koeln" },
        { label: "Events", href: "/events?groups=koeln" },
      ],
    });
  });

  it("adds a Dateien leaf only when showFiles is true", () => {
    expect(byLabel(navItems({ showFiles: false }), "Dateien")).toBeUndefined();
    expect(byLabel(navItems({ showFiles: true }), "Dateien")).toMatchObject({
      label: "Dateien",
      href: "/dateien",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web exec vitest run app/_public/nav-items.test.ts`
Expected: FAIL — current `navItems({ isFederal })` ignores `myGroup`/`showFiles`, so the Meine Gruppe / Dateien assertions fail.

- [ ] **Step 3: Implement the factory changes**

Replace the signature and the tail of `apps/web/app/_public/nav-items.ts`. The current file ends its `if (isFlagOn("groups")) { ... }` block then `return items;`. Change the function signature and append the two new blocks before `return items;`:

```ts
/** Top navigation. Computed per-request so flags apply. Federal board members
 *  get the management pages folded in as sub-items under Events / Gruppen.
 *  Signed-in members additionally get a "Meine Gruppe" dropdown and a "Dateien"
 *  item (both decided by the caller, which has the session + flags). */
export function navItems({
  isFederal = false,
  myGroup,
  showFiles = false,
}: {
  isFederal?: boolean;
  myGroup?: { slug: string };
  showFiles?: boolean;
} = {}): NavItem[] {
```

Then, immediately before `return items;`, add:

```ts
if (myGroup) {
  items.push({
    label: "Meine Gruppe",
    children: [
      { label: "Übersicht", href: `/gruppen/${myGroup.slug}` },
      { label: "Events", href: `/events?groups=${myGroup.slug}` },
    ],
  });
}
if (showFiles) items.push({ label: "Dateien", href: "/dateien" });
```

Leave the existing `isFederal` Events/Gruppen logic untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/web exec vitest run app/_public/nav-items.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @bdas/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_public/nav-items.ts apps/web/app/_public/nav-items.test.ts
git commit -m "feat(web): navItems supports Meine Gruppe dropdown + Dateien item"
```

---

## Task 2: PublicHeader — resolve member group + files flag

**Files:**

- Modify: `apps/web/app/_public/PublicHeader.tsx`

**Interfaces:**

- Consumes: `navItems({ isFederal, myGroup, showFiles })` from Task 1; `getGroup(db, id)` from `@bdas/groups`; `getDb` from `@bdas/db`; `isFlagOn` from `@bdas/feature-flags`; `loadCurrentMember()` (already imported).
- Produces: header renders the new items. No exported symbol changes.

- [ ] **Step 1: Add imports**

In `apps/web/app/_public/PublicHeader.tsx`, the current imports include `isFederalBoard` from `@bdas/members` and `canAdministerBoard` from `@bdas/dashboard-shell`. Add these imports below them:

```ts
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroup } from "@bdas/groups";
```

- [ ] **Step 2: Compute `myGroup` and `showFiles`, pass to `navItems`**

Find this block near the top of `export async function PublicHeader()`:

```ts
const me = await loadCurrentMember();
const isBoard = me ? canAdministerBoard(me.grants) : false;
const items = navItems({ isFederal: me ? isFederalBoard(me.grants) : false });
const displayName = me?.member?.firstName ?? "Konto";
```

Replace it with:

```ts
const me = await loadCurrentMember();
const isBoard = me ? canAdministerBoard(me.grants) : false;

// "Meine Gruppe" links into the public group page + group-filtered events; it
// needs the group's slug and only makes sense while groups are enabled and the
// group is not archived (its public page 404s otherwise).
const groupId = me?.member?.primaryGroupId ?? null;
const group = groupId && isFlagOn("groups") ? await getGroup(getDb(), groupId) : null;
const myGroup = group && group.status !== "archived" ? { slug: group.slug } : undefined;

// Files access is per member-kind, independent of the group page; flag-gate it
// so the item never renders while BDAS_FLAG_FILES is off (no dead link).
const showFiles = Boolean(me?.member) && isFlagOn("files");

const items = navItems({
  isFederal: me ? isFederalBoard(me.grants) : false,
  myGroup,
  showFiles,
});
const displayName = me?.member?.firstName ?? "Konto";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bdas/web typecheck`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `pnpm --filter @bdas/web lint`
Expected: no errors (no deep-import boundary violations — `getGroup` is a public export).

- [ ] **Step 5: Manual smoke (optional but recommended)**

With `BDAS_FLAG_GROUPS=true` and a signed-in member whose `primaryGroupId` is set, load any public-shell page: the header shows "Meine Gruppe" (→ Übersicht, Events). With `BDAS_FLAG_FILES=true`, "Dateien" also shows. Signed-out users see neither.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_public/PublicHeader.tsx
git commit -m "feat(web): wire Meine Gruppe + Dateien nav items in PublicHeader"
```

---

## Task 3: `listPastEvents` in the events module

**Files:**

- Modify: `modules/events/src/services/list.ts`
- Modify: `modules/events/src/index.ts`
- Modify: `modules/events/README.md`
- Test: `modules/events/src/services/list.test.ts` (create)

**Interfaces:**

- Consumes: existing `Viewer`, `ListOpts`, `EventWithCounts`, `canView`, `rowToEvent`, `withCounts`.
- Produces: `listPastEvents(db: Db, viewer: Viewer, opts?: ListOpts): Promise<ReadonlyArray<EventWithCounts>>` — published events with `startsAt < now`, newest-first, visibility-filtered. `listUpcomingEvents` keeps its exact current signature/behaviour.

- [ ] **Step 1: Write the failing test**

Create `modules/events/src/services/list.test.ts`:

```ts
/**
 * listUpcomingEvents / listPastEvents split against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable (CI provides Postgres).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { ANON, type Viewer } from "./get";
import { listPastEvents, listUpcomingEvents } from "./list";
import { createEvent, publishEvent } from "./manage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

async function dbReachable(): Promise<boolean> {
  const url = process.env["DATABASE_URL"] ?? DEFAULT_URL;
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 2 });
  try {
    await sql`select 1`;
    await sql.end();
    return true;
  } catch {
    try {
      await sql.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const describeIfDb = (await dbReachable()) ? describe : describe.skip;
const days = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const FEDERAL: Viewer = {
  isActiveMember: true,
  memberGroupIds: [],
  isFederal: true,
  boardGroupIds: [],
  organizerGroupIds: [],
};

describeIfDb("listUpcomingEvents / listPastEvents", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0002_role_grants.sql"],
      ["..", "migrations", "0001_init.sql"],
      ["..", "migrations", "0002_event_pages.sql"],
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", ...file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  async function publishPublic(title: string, startsAt: Date): Promise<string> {
    const ev = await createEvent(t.db, { title, startsAt, visibility: "public" }, "usr_creator");
    await publishEvent(t.db, ev.id);
    return ev.id;
  }

  it("partitions published events by start time", async () => {
    const pastId = await publishPublic("Rückblick", days(-5));
    const futureId = await publishPublic("Ausblick", days(5));

    const upcoming = await listUpcomingEvents(t.db, FEDERAL);
    const past = await listPastEvents(t.db, FEDERAL);

    expect(upcoming.map((e) => e.id)).toEqual([futureId]);
    expect(past.map((e) => e.id)).toEqual([pastId]);
  });

  it("orders past events newest-first", async () => {
    const older = await publishPublic("Älter", days(-10));
    const newer = await publishPublic("Neuer", days(-2));

    const past = await listPastEvents(t.db, FEDERAL);
    expect(past.map((e) => e.id)).toEqual([newer, older]);
  });

  it("applies the visibility filter to past events", async () => {
    const publicId = await publishPublic("Offen", days(-3));
    const members = await createEvent(
      t.db,
      { title: "Intern", startsAt: days(-3), visibility: "members_only" },
      "usr_creator",
    );
    await publishEvent(t.db, members.id);

    const anonPast = await listPastEvents(t.db, ANON);
    expect(anonPast.map((e) => e.id)).toEqual([publicId]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/events-module exec vitest run src/services/list.test.ts`
Expected: FAIL — `listPastEvents` is not exported from `./list` (import error / undefined).

- [ ] **Step 3: Implement `listPastEvents` with a shared internal helper**

In `modules/events/src/services/list.ts`, update the drizzle import to add `desc` and `lt`:

```ts
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
```

Replace the existing `listUpcomingEvents` function (the one that builds `conds` and selects) with this shared helper + two thin exports. Keep `withCounts` and `listManagedEvents` unchanged:

```ts
async function listByTimeframe(
  db: Db,
  viewer: Viewer,
  timeframe: "upcoming" | "past",
  opts: ListOpts,
): Promise<ReadonlyArray<EventWithCounts>> {
  const now = new Date();
  const conds = [
    eq(events.status, "published"),
    timeframe === "upcoming" ? gte(events.startsAt, now) : lt(events.startsAt, now),
  ];
  if (opts.groupId !== undefined) {
    conds.push(opts.groupId === null ? isNull(events.groupId) : eq(events.groupId, opts.groupId));
  }
  const rows = await db
    .select()
    .from(events)
    .where(and(...conds))
    .orderBy(timeframe === "upcoming" ? asc(events.startsAt) : desc(events.startsAt));
  const visible = rows.filter((r) => canView(viewer, rowToEvent(r)));
  return withCounts(db, visible);
}

/**
 * Upcoming, published events the viewer may see (visibility-filtered), ordered
 * by start time. The visibility predicate runs in JS (small N) — see canView.
 */
export function listUpcomingEvents(
  db: Db,
  viewer: Viewer,
  opts: ListOpts = {},
): Promise<ReadonlyArray<EventWithCounts>> {
  return listByTimeframe(db, viewer, "upcoming", opts);
}

/**
 * Past, published events the viewer may see (visibility-filtered), newest-first.
 * Mirrors listUpcomingEvents for the /events "Vergangene" section.
 */
export function listPastEvents(
  db: Db,
  viewer: Viewer,
  opts: ListOpts = {},
): Promise<ReadonlyArray<EventWithCounts>> {
  return listByTimeframe(db, viewer, "past", opts);
}
```

- [ ] **Step 4: Export from the module surface**

In `modules/events/src/index.ts`, change the list export line:

```ts
export {
  listUpcomingEvents,
  listPastEvents,
  listManagedEvents,
  type ListOpts,
} from "./services/list";
```

- [ ] **Step 5: Document in the README**

In `modules/events/README.md`, in the list of exported functions (near the existing `listUpcomingEvents,` entry around line 47), add a line:

```
  listPastEvents,   // published events with startsAt < now, newest-first, visibility-filtered
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @bdas/events-module exec vitest run src/services/list.test.ts`
Expected: PASS (3 tests). If it reports "skipped", start local Postgres first (`docker compose up -d db` or your usual `postgres://bdas:bdas@localhost:5432/bdas`) and re-run.

- [ ] **Step 7: Typecheck the module**

Run: `pnpm --filter @bdas/events-module typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add modules/events/src/services/list.ts modules/events/src/index.ts modules/events/README.md modules/events/src/services/list.test.ts
git commit -m "feat(events): add listPastEvents mirroring listUpcomingEvents"
```

---

## Task 4: Pure events filter helpers

**Files:**

- Create: `apps/web/app/events/event-filter.ts`
- Test: `apps/web/app/events/event-filter.test.ts`

**Interfaces:**

- Consumes: `EventWithCounts` type from `@bdas/events-module` (only `groupId` is read).
- Produces:
  - `FEDERATION_KEY = "bundesweit"` constant.
  - `type OwnerChip = { key: string; label: string }`.
  - `type GroupInfo = { name: string; slug: string }`.
  - `deriveOwners(events, groupById): OwnerChip[]` — distinct owners present, group chips sorted by German name, `Bundesweit` last (only if any `groupId === null`).
  - `parseSelected(param, validKeys): Set<string>` — split comma list, keep only keys in `validKeys`.
  - `filterByGroups(events, selected, groupById)` — `selected` empty ⇒ all; else keep events whose owner key is selected.
  - `buildHref(selected, past): string` and `toggleHref(chipKey, selected, past): string`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/events/event-filter.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildHref,
  deriveOwners,
  FEDERATION_KEY,
  filterByGroups,
  parseSelected,
  toggleHref,
  type GroupInfo,
} from "./event-filter";

const groupById = new Map<string, GroupInfo>([
  ["g_koeln", { name: "Köln", slug: "koeln" }],
  ["g_berlin", { name: "Berlin", slug: "berlin" }],
]);

const ev = (groupId: string | null) => ({ groupId });

describe("deriveOwners", () => {
  it("returns only present groups, sorted by name, Bundesweit last", () => {
    const owners = deriveOwners(
      [ev("g_koeln"), ev(null), ev("g_berlin"), ev("g_koeln")],
      groupById,
    );
    expect(owners).toEqual([
      { key: "berlin", label: "Berlin" },
      { key: "koeln", label: "Köln" },
      { key: FEDERATION_KEY, label: "Bundesweit" },
    ]);
  });

  it("omits Bundesweit when no federation-wide event is present", () => {
    const owners = deriveOwners([ev("g_koeln")], groupById);
    expect(owners).toEqual([{ key: "koeln", label: "Köln" }]);
  });
});

describe("parseSelected", () => {
  it("keeps only valid keys", () => {
    const valid = new Set(["koeln", "berlin", FEDERATION_KEY]);
    expect([...parseSelected("koeln,unknown,bundesweit", valid)]).toEqual(["koeln", "bundesweit"]);
    expect(parseSelected(undefined, valid).size).toBe(0);
  });
});

describe("filterByGroups", () => {
  const events = [ev("g_koeln"), ev("g_berlin"), ev(null)] as never[];
  it("returns all when selection is empty", () => {
    expect(filterByGroups(events, new Set(), groupById)).toHaveLength(3);
  });
  it("filters to selected group slugs", () => {
    expect(filterByGroups(events, new Set(["koeln"]), groupById)).toEqual([ev("g_koeln")]);
  });
  it("matches federation-wide events via the federation key", () => {
    expect(filterByGroups(events, new Set([FEDERATION_KEY]), groupById)).toEqual([ev(null)]);
  });
});

describe("buildHref / toggleHref", () => {
  it("builds a bare /events with no selection and no past", () => {
    expect(buildHref(new Set(), false)).toBe("/events");
  });
  it("encodes selection and past flag", () => {
    expect(buildHref(new Set(["koeln", "berlin"]), true)).toBe(
      "/events?groups=koeln%2Cberlin&past=1",
    );
  });
  it("toggles a key while preserving past", () => {
    expect(toggleHref("koeln", new Set(["koeln"]), true)).toBe("/events?past=1");
    expect(toggleHref("berlin", new Set(["koeln"]), false)).toBe("/events?groups=koeln%2Cberlin");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web exec vitest run app/events/event-filter.test.ts`
Expected: FAIL — `./event-filter` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `apps/web/app/events/event-filter.ts`:

```ts
import type { EventWithCounts } from "@bdas/events-module";

/** Synthetic chip key for federation-wide events (groupId === null). */
export const FEDERATION_KEY = "bundesweit";

export type OwnerChip = { key: string; label: string };
export type GroupInfo = { name: string; slug: string };

type HasGroup = Pick<EventWithCounts, "groupId">;

/** Distinct owners that actually appear in `events`. Group chips first, sorted
 *  by German name; the Bundesweit bucket last, only when some event is
 *  federation-wide. Unknown groupIds (no map entry) are skipped. */
export function deriveOwners(
  events: ReadonlyArray<HasGroup>,
  groupById: ReadonlyMap<string, GroupInfo>,
): OwnerChip[] {
  let hasFederation = false;
  const bySlug = new Map<string, string>(); // slug -> name
  for (const e of events) {
    if (e.groupId === null) {
      hasFederation = true;
      continue;
    }
    const g = groupById.get(e.groupId);
    if (g && !bySlug.has(g.slug)) bySlug.set(g.slug, g.name);
  }
  const chips: OwnerChip[] = [...bySlug.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "de"))
    .map(([slug, name]) => ({ key: slug, label: name }));
  if (hasFederation) chips.push({ key: FEDERATION_KEY, label: "Bundesweit" });
  return chips;
}

/** Parse a comma-separated `groups` param, discarding keys not in `valid`. */
export function parseSelected(param: string | undefined, valid: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  if (!param) return out;
  for (const raw of param.split(",")) {
    const key = raw.trim();
    if (key && valid.has(key)) out.add(key);
  }
  return out;
}

/** Empty selection ⇒ everything. Otherwise keep events whose owner is selected. */
export function filterByGroups<T extends HasGroup>(
  events: ReadonlyArray<T>,
  selected: ReadonlySet<string>,
  groupById: ReadonlyMap<string, GroupInfo>,
): ReadonlyArray<T> {
  if (selected.size === 0) return events;
  return events.filter((e) => {
    if (e.groupId === null) return selected.has(FEDERATION_KEY);
    const g = groupById.get(e.groupId);
    return g ? selected.has(g.slug) : false;
  });
}

/** Build the /events href for a given selection + past flag. */
export function buildHref(selected: ReadonlySet<string>, past: boolean): string {
  const params = new URLSearchParams();
  if (selected.size > 0) params.set("groups", [...selected].join(","));
  if (past) params.set("past", "1");
  const q = params.toString();
  return q ? `/events?${q}` : "/events";
}

/** Href that flips one chip in/out of the current selection (past preserved). */
export function toggleHref(chipKey: string, selected: ReadonlySet<string>, past: boolean): string {
  const next = new Set(selected);
  if (next.has(chipKey)) next.delete(chipKey);
  else next.add(chipKey);
  return buildHref(next, past);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/web exec vitest run app/events/event-filter.test.ts`
Expected: PASS (all cases). Note: `URLSearchParams` encodes the comma as `%2C` — the test asserts that exact output.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/events/event-filter.ts apps/web/app/events/event-filter.test.ts
git commit -m "feat(web): pure events group-filter helpers"
```

---

## Task 5: EventFilterBar component

**Files:**

- Create: `apps/web/app/events/EventFilterBar.tsx`

**Interfaces:**

- Consumes: `OwnerChip`, `buildHref`, `toggleHref` from `./event-filter` (Task 4); `cx` from `@bdas/design-system`.
- Produces: `EventFilterBar({ chips, selected, past }: { chips: ReadonlyArray<OwnerChip>; selected: ReadonlySet<string>; past: boolean }): JSX.Element | null` — a server component rendering `<Link>` chips (mirroring FilterChip's token styling) + a past toggle. Returns `null` only when there are no chips **and** `past` is false.

- [ ] **Step 1: Implement the component**

Create `apps/web/app/events/EventFilterBar.tsx`:

```tsx
import Link from "next/link";

import { cx } from "@bdas/design-system";

import { buildHref, toggleHref, type OwnerChip } from "./event-filter";

// Mirrors core/design-system FilterChip's token styling; rendered as a <Link>
// so filtering stays server-driven (shareable URLs, no client JS).
const CHIP =
  "inline-flex items-center rounded-bdas-pill border px-3 py-1 text-bdas-pill transition-colors duration-bdas-quick ease-bdas";
const ON = "border-bdas-strong bg-bdas-red text-white";
const OFF = "border-bdas-soft bg-bdas-surface text-bdas-ink hover:bg-bdas-overlay-hover";

export function EventFilterBar({
  chips,
  selected,
  past,
}: {
  chips: ReadonlyArray<OwnerChip>;
  selected: ReadonlySet<string>;
  past: boolean;
}) {
  if (chips.length === 0 && !past) return null;

  return (
    <div className="flex flex-col gap-3">
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildHref(new Set(), past)}
            className={cx(CHIP, selected.size === 0 ? ON : OFF)}
          >
            Alle
          </Link>
          {chips.map((c) => (
            <Link
              key={c.key}
              href={toggleHref(c.key, selected, past)}
              className={cx(CHIP, selected.has(c.key) ? ON : OFF)}
            >
              {c.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div>
        <Link href={buildHref(selected, !past)} className={cx(CHIP, past ? ON : OFF)}>
          {past ? "Nur kommende" : "Vergangene anzeigen"}
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bdas/web typecheck`
Expected: no errors. (The component is consumed in Task 6; typecheck passes now because it only imports Task 4 symbols.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/events/EventFilterBar.tsx
git commit -m "feat(web): EventFilterBar chip bar + past toggle (server links)"
```

---

## Task 6: Wire the filter + past sections into /events

**Files:**

- Modify: `apps/web/app/events/page.tsx`

**Interfaces:**

- Consumes: `listUpcomingEvents`, `listPastEvents` from `@bdas/events-module`; `listGroups` from `@bdas/groups`; `deriveOwners`, `parseSelected`, `filterByGroups`, `type GroupInfo` from `./event-filter`; `EventFilterBar` from `./EventFilterBar`.
- Produces: the page renders the filter bar, a "Kommende" section, and (when `?past=1`) a muted "Vergangene" section with a "Vorbei" badge.

- [ ] **Step 1: Replace the page implementation**

Replace the entire contents of `apps/web/app/events/page.tsx` with:

```tsx
import Link from "next/link";

import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { listPastEvents, listUpcomingEvents, type EventWithCounts } from "@bdas/events-module";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { requireEventsFlag } from "../_events/flag";
import { readSessionCookie } from "../../lib/auth-cookie";
import { viewerFrom } from "../../lib/event-viewer";
import { formatDateTime } from "../../lib/format";
import { EventFilterBar } from "./EventFilterBar";
import { deriveOwners, filterByGroups, parseSelected, type GroupInfo } from "./event-filter";

export const metadata = { title: "Veranstaltungen" };

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function EventCard({ e, past }: { e: EventWithCounts; past: boolean }) {
  const full = e.capacity !== null && e.confirmedCount >= e.capacity;
  return (
    <Link href={`/events/${e.id}`} className="block focus:outline-none">
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
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  requireEventsFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const viewer = viewerFrom(me);
  const showPast = firstParam(searchParams["past"]) === "1";

  const [upcoming, groups] = await Promise.all([listUpcomingEvents(db, viewer), listGroups(db)]);
  const pastEvents = showPast ? await listPastEvents(db, viewer) : [];

  const groupById = new Map<string, GroupInfo>(
    groups.map((g) => [g.id, { name: g.name, slug: g.slug }]),
  );
  const chips = deriveOwners([...upcoming, ...pastEvents], groupById);
  const validKeys = new Set(chips.map((c) => c.key));
  const selected = parseSelected(firstParam(searchParams["groups"]), validKeys);

  const upcomingShown = filterByGroups(upcoming, selected, groupById);
  const pastShown = filterByGroups(pastEvents, selected, groupById);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-bdas-ink">Veranstaltungen</h1>
        <p className="text-bdas-ink-body">Kommende Veranstaltungen des BDAS.</p>
      </header>

      <EventFilterBar chips={chips} selected={selected} past={showPast} />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-bdas-ink-muted">
          Kommende
        </h2>
        {upcomingShown.length === 0 ? (
          <Alert variant="info" title="Keine Veranstaltungen">
            {selected.size > 0
              ? "Keine kommenden Veranstaltungen für diese Auswahl."
              : "Aktuell sind keine kommenden Veranstaltungen geplant."}
          </Alert>
        ) : (
          <ul className="flex flex-col gap-4">
            {upcomingShown.map((e) => (
              <li key={e.id}>
                <EventCard e={e} past={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {showPast ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-bdas-ink-muted">
            Vergangene
          </h2>
          {pastShown.length === 0 ? (
            <Alert variant="info" title="Keine vergangenen Veranstaltungen">
              Für diese Auswahl gibt es keine vergangenen Veranstaltungen.
            </Alert>
          ) : (
            <ul className="flex flex-col gap-4">
              {pastShown.map((e) => (
                <li key={e.id}>
                  <EventCard e={e} past={true} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 2: Verify token classes exist**

Confirm `bg-bdas-overlay-faint` and `rounded-bdas-sm` are real token utilities (they are used elsewhere — e.g. `PublicHeader` mobile nav uses `bg-bdas-overlay-faint`, dropdown links use `rounded-bdas-sm`).

Run: `grep -rn "overlay-faint\|rounded-bdas-sm" apps/web/app/_public/PublicHeader.tsx`
Expected: at least one match each (confirms the utilities exist in the token set).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bdas/web typecheck`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `pnpm --filter @bdas/web lint`
Expected: no errors.

- [ ] **Step 5: Run the web test suite**

Run: `pnpm --filter @bdas/web test`
Expected: PASS, including `nav-items.test.ts` and `event-filter.test.ts`.

- [ ] **Step 6: Manual smoke (recommended)**

With `BDAS_FLAG_EVENTS=true`, visit `/events`: a filter bar shows group chips only for groups with events, plus "Vergangene anzeigen". Selecting chips updates the list via `?groups=`. Clicking "Vergangene anzeigen" (`?past=1`) reveals a muted "Vergangene" section with "Vorbei" badges. `/events?groups=<slug>` (the "Meine Gruppe → Events" link from Task 1) lands pre-filtered.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/events/page.tsx
git commit -m "feat(web): group filter + past-events view on /events"
```

---

## Self-Review Notes (author)

- **Spec coverage:** A1 dropdown (Tasks 1–2), A2 Dateien item (Tasks 1–2), B1 group filter (Tasks 4–6), B2 past events (Tasks 3, 5, 6). Alumnus left inert (non-goal). ✅
- **Type consistency:** `OwnerChip`/`GroupInfo`/`FEDERATION_KEY` defined in Task 4 and consumed unchanged in Tasks 5–6; `listPastEvents` signature defined in Task 3 matches its use in Task 6; `navItems` option shape defined in Task 1 matches the call in Task 2. ✅
- **No client JS:** chips + past toggle are `<Link>`s; `EventFilterBar` has no `"use client"`. ✅
- **Regression guard:** existing `/events` card fields preserved; §23 events create-flow E2E untouched. Verify it stays green after Task 6 with `pnpm --filter @bdas/web test` and the repo's e2e job.

```

```
