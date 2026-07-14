# Group Locations + Interactive Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Groups can set a location via the existing Photon place search; a public Leaflet map on the start page and `/gruppen` shows one pin per located group, with a popup linking to `/gruppen/[slug]`.

**Architecture:** Four nullable location columns on the `groups` table with tri-state update semantics (undefined = keep, null = clear, object = replace). The existing `LocationPicker` moves to a shared folder and gains an `onChange` + clear affordance; both group edit forms use it. A client-only Leaflet component renders pins from a server-side projection that strips the address. Everything public is gated by a new `group_map` flag and degrades to today's UI when there are no pins.

**Tech Stack:** Next.js 14 App Router, Drizzle/Postgres, zod, Leaflet 1.9 + OSM raster tiles, Photon geocoder (existing), Playwright e2e, vitest + Docker Postgres integration tests.

**Spec:** `docs/superpowers/specs/2026-07-06-group-locations-map-design.md`

## Global Constraints

- CLAUDE.md module rules apply: groups module owns its tables; app code accesses them only via `@bdas/groups` exports; migrations live in `modules/groups/migrations/` and run in lexical filename order (manifest already includes `groups`).
- The street address (`location_address`) and place name (`location_name`) are **never rendered on public pages**. Public pages pass only `slug, name, city, lat, lng` to the client (the `toPins` projection).
- Design system: no inline hex/radius/shadow/duration — use existing Tailwind token classes (`bg-bdas-red`, `rounded-bdas`, `border-bdas-soft`, `shadow-bdas-card`, ink classes).
- Feature flag env format: `BDAS_FLAG_GROUP_MAP=true`. Flag gates ONLY public map rendering; edit fields ship ungated.
- German UI copy, matching existing tone (e.g. „Ort entfernen“, „Zur Gruppenseite →“).
- All commits: end message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Integration tests require Docker Postgres: `pnpm db:up` first; they self-skip when unreachable — a skipped suite is NOT a pass, run with the DB up.
- Repo commands: `pnpm test` (vitest, repo root), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm e2e` (needs built app + migrated DB, see `playwright.config.ts` header).

---

### Task 1: Groups module — location columns, types, services

**Files:**

- Create: `modules/groups/migrations/0004_location.sql`
- Create: `modules/groups/src/location.ts`
- Modify: `modules/groups/src/schema.ts`
- Modify: `modules/groups/src/types.ts`
- Modify: `modules/groups/src/services/get.ts`
- Modify: `modules/groups/src/services/list.ts`
- Modify: `modules/groups/src/services/manage.ts`
- Modify: `modules/groups/src/services/upsert.ts`
- Modify: `modules/groups/src/index.ts`
- Modify: `modules/groups/README.md` (owned-tables row)
- Test: `modules/groups/src/index.test.ts`

**Interfaces:**

- Produces: `type GroupLocation = { readonly name: string; readonly address: string; readonly lat: number; readonly lng: number }`, exported from `@bdas/groups`. `Group` and `GroupSummary` gain `readonly location: GroupLocation | null`. `CreateGroupInput`/`UpdateGroupInput`/`UpsertGroupInput` accept optional/nullable `location`. Update semantics: `location` **undefined = leave stored value untouched**, `null` = clear, object = replace.

- [ ] **Step 1: Write the failing tests**

In `modules/groups/src/index.test.ts`, first add `"0004_location.sql"` to the migration array in the existing `beforeEach`:

```ts
    for (const file of [
      "0001_init.sql",
      "0002_status_check.sql",
      "0003_drop_university_description.sql",
      "0004_location.sql",
    ]) {
```

Then append these tests inside the `describeIfDb("groups integration", ...)` block:

```ts
it("stores a location, preserves it on location-less update, clears on null", async () => {
  const created = await createGroup(t.db, {
    slug: "bonn",
    name: "BDAS Bonn",
    city: "Bonn",
    location: {
      name: "Uni Bonn",
      address: "Regina-Pacis-Weg 3, Bonn",
      lat: 50.7339,
      lng: 7.1022,
    },
  });
  expect(created.location).toEqual({
    name: "Uni Bonn",
    address: "Regina-Pacis-Weg 3, Bonn",
    lat: 50.7339,
    lng: 7.1022,
  });

  // `location` absent → stored location untouched
  const kept = await updateGroup(t.db, created.id, { name: "BDAS Bonn e.V.", city: "Bonn" });
  expect(kept.location?.name).toBe("Uni Bonn");
  expect((await getGroup(t.db, created.id))?.location?.name).toBe("Uni Bonn");

  // explicit null → cleared
  const cleared = await updateGroup(t.db, created.id, {
    name: "BDAS Bonn e.V.",
    city: "Bonn",
    location: null,
  });
  expect(cleared.location).toBeNull();
  expect((await getGroup(t.db, created.id))?.location).toBeNull();
});

it("re-seeding via upsert without location keeps the stored location", async () => {
  await upsertGroupBySlug(t.db, {
    slug: "ulm",
    name: "BDAS Ulm",
    city: "Ulm",
    location: { name: "Uni Ulm", address: "Helmholtzstraße 16, Ulm", lat: 48.4227, lng: 9.9563 },
  });
  await upsertGroupBySlug(t.db, { slug: "ulm", name: "BDAS Ulm", city: "Ulm" });
  expect((await getGroupBySlug(t.db, "ulm"))?.location?.name).toBe("Uni Ulm");
});

it("rejects out-of-range coordinates", async () => {
  await expect(
    createGroup(t.db, {
      slug: "kaputt",
      name: "BDAS Kaputt",
      city: "Kaputtstadt",
      location: { name: "Ort", address: "", lat: 91, lng: 0 },
    }),
  ).rejects.toThrow("Eingabe ungültig");
});

it("listGroups exposes location for the map", async () => {
  await upsertGroupBySlug(t.db, {
    slug: "koeln",
    name: "BDAS Köln",
    city: "Köln",
    location: {
      name: "Universität zu Köln",
      address: "Albertus-Magnus-Platz, Köln",
      lat: 50.9271,
      lng: 6.9285,
    },
  });
  await upsertGroupBySlug(t.db, { slug: "essen", name: "BDAS Essen", city: "Essen" });

  const active = await listGroups(t.db, { status: "active" });
  expect(active.find((g) => g.slug === "koeln")?.location).toEqual({
    name: "Universität zu Köln",
    address: "Albertus-Magnus-Platz, Köln",
    lat: 50.9271,
    lng: 6.9285,
  });
  expect(active.find((g) => g.slug === "essen")?.location).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm db:up && pnpm vitest run modules/groups`
Expected: FAIL — first with `ENOENT ... 0004_location.sql`, and type errors on `location` (that's the point).

- [ ] **Step 3: Create the migration**

`modules/groups/migrations/0004_location.sql`:

```sql
-- Optional meeting-point location per group (spec 2026-07-06 group map).
-- name/address are editor-facing only; lat/lng feed the public map.
ALTER TABLE groups
  ADD COLUMN location_name text,
  ADD COLUMN location_address text,
  ADD COLUMN location_lat double precision,
  ADD COLUMN location_lng double precision,
  ADD CONSTRAINT groups_location_pair_check
    CHECK ((location_lat IS NULL) = (location_lng IS NULL));
```

- [ ] **Step 4: Extend the drizzle schema**

In `modules/groups/src/schema.ts`, change the import and add four columns after `websiteUrl`:

```ts
import { doublePrecision, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
```

```ts
    websiteUrl: text("website_url"),
    locationName: text("location_name"),
    locationAddress: text("location_address"),
    locationLat: doublePrecision("location_lat"),
    locationLng: doublePrecision("location_lng"),
```

- [ ] **Step 5: Add the domain type**

In `modules/groups/src/types.ts`:

```ts
export type GroupLocation = {
  readonly name: string;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
};
```

Add to `Group`:

```ts
  readonly websiteUrl: string | null;
  readonly location: GroupLocation | null;
```

Change `GroupSummary`:

```ts
export type GroupSummary = Pick<Group, "id" | "slug" | "name" | "city" | "status" | "location">;
```

- [ ] **Step 6: Create the shared location helper**

`modules/groups/src/location.ts` (new file — internal, NOT re-exported from index):

```ts
/**
 * Location input schema + row mapper, shared by the manage and upsert
 * services. Update semantics are tri-state: `undefined` leaves the stored
 * location untouched, `null` clears it, an object replaces it — so seed
 * files without a location never wipe a location set through the UI.
 */
import { z } from "zod";

import type { groups } from "./schema";
import type { GroupLocation } from "./types";

export const GroupLocationInput = z.object({
  name: z.string().min(1, "Ortsname fehlt").max(200, "Ortsname ist zu lang"),
  address: z.string().max(300, "Adresse ist zu lang"),
  lat: z.number().min(-90, "Ungültige Koordinaten").max(90, "Ungültige Koordinaten"),
  lng: z.number().min(-180, "Ungültige Koordinaten").max(180, "Ungültige Koordinaten"),
});
export type GroupLocationInput = z.infer<typeof GroupLocationInput>;

type LocationColumns = Pick<
  typeof groups.$inferSelect,
  "locationName" | "locationAddress" | "locationLat" | "locationLng"
>;

export function rowLocation(r: LocationColumns): GroupLocation | null {
  if (r.locationLat === null || r.locationLng === null) return null;
  return {
    name: r.locationName ?? "",
    address: r.locationAddress ?? "",
    lat: r.locationLat,
    lng: r.locationLng,
  };
}

/** Drizzle `.set()`/`.values()` fragment for a validated location input. */
export function locationColumns(location: GroupLocationInput | null | undefined) {
  return {
    locationName: location?.name ?? null,
    locationAddress: location?.address ?? null,
    locationLat: location?.lat ?? null,
    locationLng: location?.lng ?? null,
  };
}
```

- [ ] **Step 7: Update the services**

`modules/groups/src/services/get.ts` — import and use the mapper:

```ts
import { rowLocation } from "../location";
```

In `row2group`, add:

```ts
    websiteUrl: r.websiteUrl,
    location: rowLocation(r),
```

`modules/groups/src/services/list.ts` — select the columns and map them:

```ts
import { rowLocation } from "../location";
```

```ts
    .select({
      id: groups.id,
      slug: groups.slug,
      name: groups.name,
      city: groups.city,
      status: groups.status,
      locationName: groups.locationName,
      locationAddress: groups.locationAddress,
      locationLat: groups.locationLat,
      locationLng: groups.locationLng,
    })
```

```ts
return rows.map((r) => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  city: r.city,
  status: r.status as GroupStatus,
  location: rowLocation(r),
}));
```

`modules/groups/src/services/manage.ts`:

```ts
import { GroupLocationInput, locationColumns, rowLocation } from "../location";
import type { Group, GroupLocation, GroupStatus } from "../types";
```

Add to `UpdateGroupInput` (after `status`):

```ts
  location: GroupLocationInput.optional().nullable(),
```

`rowToGroup` gains `location: rowLocation(r),`. Change `toGroup` to take the effective location explicitly:

```ts
function toGroup(
  id: string,
  slug: string,
  v: UpdateGroupInput,
  location: GroupLocation | null,
): Group {
  return {
    id,
    slug,
    name: v.name,
    city: v.city,
    contactEmail: v.contactEmail ?? null,
    instagramUrl: v.instagramUrl ?? null,
    websiteUrl: v.websiteUrl ?? null,
    status: v.status as GroupStatus,
    location,
  };
}
```

In `createGroup`, add to `.values({ ... })`:

```ts
    ...locationColumns(v.location),
```

and return `toGroup(id, v.slug, v, v.location ?? null);`

In `updateGroup`, build the set-fragment tri-state and compute the effective location for the return value:

```ts
const now = new Date();
await db
  .update(groups)
  .set({
    name: v.name,
    city: v.city,
    contactEmail: v.contactEmail ?? null,
    instagramUrl: v.instagramUrl ?? null,
    websiteUrl: v.websiteUrl ?? null,
    status: v.status,
    ...(v.location !== undefined ? locationColumns(v.location) : {}),
    updatedAt: now,
  })
  .where(eq(groups.id, id));
```

```ts
const location = v.location === undefined ? rowLocation(existing[0]) : (v.location ?? null);
return toGroup(id, existing[0].slug, v, location);
```

`modules/groups/src/services/upsert.ts` — same pattern:

```ts
import { GroupLocationInput, locationColumns, rowLocation } from "../location";
import type { Group, GroupLocation, GroupStatus } from "../types";
```

Add to `UpsertGroupInput`:

```ts
  location: GroupLocationInput.optional().nullable(),
```

Update path `.set({...})` gains `...(v.location !== undefined ? locationColumns(v.location) : {}),`; insert path `.values({...})` gains `...locationColumns(v.location),`. Change `toGroup` to `toGroup(id: string, v: UpsertGroupInput, location: GroupLocation | null)` adding `location` to the returned object; call it with `rowLocation`-derived effective location on update (`v.location === undefined ? rowLocation(existing[0]) : (v.location ?? null)`) and `v.location ?? null` on insert.

- [ ] **Step 8: Export the type + update README**

`modules/groups/src/index.ts`:

```ts
export type { Group, GroupSummary, GroupStatus, GroupLocation, JoinPolicy } from "./types";
```

`modules/groups/README.md` — owned-tables row becomes:

```md
| `groups` | Slug, display name, city, contacts, status, optional map location (name/address editor-only; lat/lng public) |
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm vitest run modules/groups && pnpm typecheck`
Expected: all groups tests PASS (not skipped — DB must be up), typecheck clean.
If the repo-wide typecheck flags other places that construct `GroupSummary` object literals, add `location: null` there (the type gained a required field).

- [ ] **Step 10: Commit**

```bash
git add modules/groups
git commit -m "feat(groups): optional map location per group (tri-state update semantics)"
```

---

### Task 2: `group_map` feature flag

**Files:**

- Modify: `core/feature-flags/src/index.ts`
- Test: `core/feature-flags/src/index.test.ts`

**Interfaces:**

- Produces: `"group_map"` as a valid `FlagName` for `isFlagOn`/`requireFlag`. Env var: `BDAS_FLAG_GROUP_MAP`.

- [ ] **Step 1: Write the failing test**

Append inside the existing describe block of `core/feature-flags/src/index.test.ts` (it already snapshots/restores `process.env`):

```ts
it("group_map maps to BDAS_FLAG_GROUP_MAP", () => {
  delete process.env["BDAS_FLAG_GROUP_MAP"];
  expect(isFlagOn("group_map")).toBe(false);
  process.env["BDAS_FLAG_GROUP_MAP"] = "true";
  expect(isFlagOn("group_map")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run core/feature-flags`
Expected: FAIL — TS error, `"group_map"` is not assignable to `FlagName`.

- [ ] **Step 3: Add the flag**

In `core/feature-flags/src/index.ts` add to the `FLAGS` array:

```ts
  "public_shell",
  "group_map",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run core/feature-flags`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/feature-flags
git commit -m "feat(flags): add group_map flag for the public group map"
```

---

### Task 3: Shared LocationPicker with onChange + clear

**Files:**

- Create: `apps/web/app/_components/LocationPicker.tsx` (moved from `apps/web/app/admin/events/_editor/LocationPicker.tsx`)
- Delete: `apps/web/app/admin/events/_editor/LocationPicker.tsx`
- Modify: `apps/web/app/admin/events/_editor/EventFields.tsx:8`

**Interfaces:**

- Consumes: `searchPlaces`, `PlaceResult` from `apps/web/app/lib/photon.ts` (unchanged).
- Produces: `LocationPicker({ defaultValue, onChange? })` — `defaultValue: { name: string; address: string; lat: number | null; lng: number | null } | null`, `onChange?: (location: PlaceResult | null) => void`. Still renders hidden inputs `locationName`, `locationAddress`, `locationLat`, `locationLng` for FormData forms. New: an „Ort entfernen“ button clears the selection.

- [ ] **Step 1: Move and extend the component**

```bash
mkdir -p apps/web/app/_components
git mv apps/web/app/admin/events/_editor/LocationPicker.tsx apps/web/app/_components/LocationPicker.tsx
```

Replace the file's content with:

```tsx
"use client";

import { useRef, useState } from "react";

import { Field, Input } from "@bdas/design-system";

import { searchPlaces, type PlaceResult } from "../lib/photon";

export function LocationPicker({
  defaultValue,
  onChange,
}: {
  defaultValue: { name: string; address: string; lat: number | null; lng: number | null } | null;
  /** Notified when a place is picked or the location is cleared. */
  onChange?: (location: PlaceResult | null) => void;
}) {
  const [selected, setSelected] = useState<PlaceResult | null>(
    defaultValue && defaultValue.lat !== null && defaultValue.lng !== null
      ? {
          name: defaultValue.name,
          address: defaultValue.address,
          lat: defaultValue.lat,
          lng: defaultValue.lng,
        }
      : null,
  );
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [q, setQ] = useState(defaultValue?.name ?? "");
  const abort = useRef<AbortController | null>(null);

  async function onInput(value: string) {
    setQ(value);
    setSelected(null);
    onChange?.(null);
    abort.current?.abort();
    abort.current = new AbortController();
    setResults(await searchPlaces(value, abort.current.signal).catch(() => []));
  }

  function pick(r: PlaceResult) {
    setSelected(r);
    setQ(r.name);
    setResults([]);
    onChange?.(r);
  }

  function clear() {
    setSelected(null);
    setQ("");
    setResults([]);
    onChange?.(null);
  }

  return (
    <Field
      label="Ort (suchen)"
      htmlFor="locationSearch"
      hint="Adresse oder Ort eingeben und auswählen."
    >
      <Input
        id="locationSearch"
        value={q}
        autoComplete="off"
        onChange={(e) => onInput(e.target.value)}
      />
      {results.length > 0 && !selected ? (
        <ul className="mt-1 rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-dropdown">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-bdas-overlay-hover"
                onClick={() => pick(r)}
              >
                <span className="text-bdas-ink">{r.name}</span>
                {r.address ? <span className="text-bdas-ink-muted"> — {r.address}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <p className="mt-1 flex items-center gap-3 text-sm text-bdas-ink-muted">
          <span>
            📍 {selected.name}
            {selected.address ? `, ${selected.address}` : ""}
          </span>
          <button type="button" onClick={clear} className="text-bdas-red hover:underline">
            Ort entfernen
          </button>
        </p>
      ) : null}
      <input type="hidden" name="locationName" value={selected?.name ?? ""} />
      <input type="hidden" name="locationAddress" value={selected?.address ?? ""} />
      <input type="hidden" name="locationLat" value={selected?.lat ?? ""} />
      <input type="hidden" name="locationLng" value={selected?.lng ?? ""} />
    </Field>
  );
}
```

- [ ] **Step 2: Update the events editor import**

In `apps/web/app/admin/events/_editor/EventFields.tsx` line 8:

```ts
import { LocationPicker } from "../../../_components/LocationPicker";
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm --filter @bdas/web test`
Expected: clean; existing photon tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_components/LocationPicker.tsx apps/web/app/admin/events/_editor
git commit -m "refactor(web): share LocationPicker; add onChange + clear affordance"
```

---

### Task 4: Location in the admin group form

**Files:**

- Modify: `apps/web/app/admin/gruppen/GroupForm.tsx`
- Modify: `apps/web/app/admin/gruppen/actions.ts`
- Modify: `apps/web/app/admin/gruppen/[slug]/bearbeiten/page.tsx`
- Modify: `apps/web/app/admin/gruppen/neu/page.tsx`

**Interfaces:**

- Consumes: `LocationPicker` from Task 3 (hidden-inputs mode), `Group["location"]` / `GroupLocation` from Task 1.
- Produces: `saveGroupAction` reads `locationName/locationAddress/locationLat/locationLng` from FormData and always passes `location` (object or `null`) to `createGroup`/`updateGroup` — full-replace, since the form always posts the complete current state.

- [ ] **Step 1: Add the picker to GroupForm**

In `apps/web/app/admin/gruppen/GroupForm.tsx`, add the import:

```ts
import { LocationPicker } from "../../_components/LocationPicker";
```

Extend `GroupFormProps.initial`:

```ts
    websiteUrl: string;
    status: string;
    location: { name: string; address: string; lat: number; lng: number } | null;
```

Render after the „Stadt“ field:

```tsx
<LocationPicker defaultValue={initial.location} />
```

- [ ] **Step 2: Parse location in the action**

In `apps/web/app/admin/gruppen/actions.ts`, add below `optional()`:

```ts
/** Hidden inputs from LocationPicker; empty lat/lng = no location. */
function locationInput(
  formData: FormData,
): { name: string; address: string; lat: number; lng: number } | null {
  const lat = str(formData, "locationLat");
  const lng = str(formData, "locationLng");
  if (lat === "" || lng === "") return null;
  return {
    name: str(formData, "locationName"),
    address: str(formData, "locationAddress"),
    lat: Number(lat),
    lng: Number(lng),
  };
}
```

Add to the `profile` object in `saveGroupAction`:

```ts
    status: str(formData, "status") || "active",
    location: locationInput(formData),
```

- [ ] **Step 3: Pass initial values from both pages**

`apps/web/app/admin/gruppen/[slug]/bearbeiten/page.tsx` — in the `initial={{ ... }}` literal add:

```ts
          status: group.status,
          location: group.location,
```

`apps/web/app/admin/gruppen/neu/page.tsx` — in its `initial={{ ... }}` literal add:

```ts
          location: null,
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (Behavior is covered end-to-end in Task 9.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/admin/gruppen
git commit -m "feat(web): set group location in the admin group form"
```

---

### Task 5: Location in the group-board Profil form

**Files:**

- Modify: `apps/web/app/(board)/_components/GroupProfileForm.tsx`
- Modify: `apps/web/app/(board)/_components/group-profile-actions.ts`
- Modify: `apps/web/app/(board)/gruppe/[slug]/profile/page.tsx`

**Interfaces:**

- Consumes: `LocationPicker` (onChange mode), `GroupLocation` from `@bdas/groups`.
- Produces: `updateGroupProfileAction(groupId, input, revalidate)` where `input` is now `{ name: string; city: string; location: GroupLocation | null }`. The form initializes `location` from the loaded group, so saving name/city alone never wipes a stored location.

- [ ] **Step 1: Extend the form**

Replace `apps/web/app/(board)/_components/GroupProfileForm.tsx` content with:

```tsx
"use client";

import { useState, useTransition } from "react";

import type { GroupLocation } from "@bdas/groups";

import { LocationPicker } from "../../_components/LocationPicker";
import { updateGroupProfileAction } from "./group-profile-actions";

export function GroupProfileForm({
  groupId,
  initial,
  revalidatePath,
}: {
  groupId: string;
  initial: { name: string; city: string; location: GroupLocation | null };
  revalidatePath: string;
}) {
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex max-w-md flex-col gap-3 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card"
      action={() =>
        start(async () => {
          setMsg(null);
          const res = await updateGroupProfileAction(groupId, form, revalidatePath);
          setMsg(res.ok ? "Gespeichert." : (res.error ?? "Fehler"));
        })
      }
    >
      <label className="flex flex-col gap-1 text-sm text-bdas-ink-muted">
        Name
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-bdas-ink-muted">
        Stadt
        <input
          required
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
      </label>
      <LocationPicker
        defaultValue={initial.location}
        onChange={(location) => setForm((f) => ({ ...f, location }))}
      />
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface disabled:opacity-40"
      >
        Speichern
      </button>
      {msg && <p className="text-sm text-bdas-ink-body">{msg}</p>}
    </form>
  );
}
```

(Path note: this file is in `apps/web/app/(board)/_components/`; route groups `(board)` don't affect the filesystem path, so the shared picker is two levels up: `../../_components/LocationPicker`.)

- [ ] **Step 2: Extend the action's input type**

In `apps/web/app/(board)/_components/group-profile-actions.ts` add the import and widen the signature:

```ts
import type { GroupLocation } from "@bdas/groups";
```

```ts
export async function updateGroupProfileAction(
  groupId: string,
  input: { name: string; city: string; location: GroupLocation | null },
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
```

(`updateGroup` already accepts `location` after Task 1; no other change.)

- [ ] **Step 3: Pass the initial location from the page**

In `apps/web/app/(board)/gruppe/[slug]/profile/page.tsx`:

```tsx
        initial={{ name: group.name, city: group.city, location: group.location }}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(board)"
git commit -m "feat(web): set group location from the board Profil form"
```

---

### Task 5b: Fix — Profil save must not wipe admin-managed fields

Pre-existing bug: `updateGroupProfileAction` passes only `{ name, city }` (now `+ location`) to `updateGroup`, whose full-replace semantics then null out `contactEmail`, `instagramUrl`, `websiteUrl` and reset `status` to `"active"`. A group lead saving their Profil silently destroys admin-entered contact data.

**Files:**

- Modify: `apps/web/app/(board)/_components/group-profile-actions.ts`

**Interfaces:**

- Consumes: `getGroup`, `updateGroup` from `@bdas/groups` (Task 1 shapes).
- Produces: unchanged action signature; behavior contract: Profil save preserves `contactEmail`/`instagramUrl`/`websiteUrl`/`status` from the stored row. Behavioral regression coverage lands in Task 9's e2e.

- [ ] **Step 1: Merge stored fields before updating**

In `apps/web/app/(board)/_components/group-profile-actions.ts`, change the groups import to:

```ts
import { getGroup, updateGroup } from "@bdas/groups";
```

and replace the `try` block of `updateGroupProfileAction` with:

```ts
try {
  const db = getDb();
  // `updateGroup` is full-replace; merge the stored admin-managed fields so
  // a Profil save never wipes contact data or resets the status.
  const existing = await getGroup(db, groupId);
  if (!existing) return { ok: false, error: "Gruppe nicht gefunden." };
  if (existing.status === "archived") {
    return { ok: false, error: "Archivierte Gruppen können nicht bearbeitet werden." };
  }
  await updateGroup(db, groupId, {
    ...input,
    contactEmail: existing.contactEmail,
    instagramUrl: existing.instagramUrl,
    websiteUrl: existing.websiteUrl,
    status: existing.status,
  });
  safeRevalidate(revalidate);
  return { ok: true };
} catch (e) {
  return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (The e2e regression assertion is added in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(board)/_components/group-profile-actions.ts"
git commit -m "fix(web): Profil save no longer wipes contact fields and status"
```

---

### Task 6: Leaflet map component + pins projection + ADR

**Files:**

- Modify: `apps/web/package.json` (via pnpm)
- Create: `apps/web/app/_groups/pins.ts`
- Create: `apps/web/app/_groups/pins.test.ts`
- Create: `apps/web/app/_groups/GroupMap.tsx`
- Create: `apps/web/app/_groups/GroupMapLazy.tsx`
- Create: `docs/decisions/0019-leaflet-for-public-group-map.md`

**Interfaces:**

- Consumes: `GroupSummary` from `@bdas/groups` (Task 1).
- Produces: `type GroupPin = { readonly slug: string; readonly name: string; readonly city: string; readonly lat: number; readonly lng: number }` and `toPins(groups: readonly GroupSummary[]): GroupPin[]` from `apps/web/app/_groups/pins.ts`; `GroupMapLazy({ pins }: { pins: GroupPin[] })` client component from `apps/web/app/_groups/GroupMapLazy.tsx` (renders nothing visible when `pins` is empty — callers still guard to avoid loading the chunk).

- [ ] **Step 1: Install Leaflet**

```bash
pnpm --filter @bdas/web add leaflet
pnpm --filter @bdas/web add -D @types/leaflet
```

Expected: `leaflet ^1.9.x` in dependencies.

- [ ] **Step 2: Write the failing pins test**

`apps/web/app/_groups/pins.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { GroupSummary } from "@bdas/groups";

import { toPins } from "./pins";

const base = { id: "grp_1", status: "active" as const };

describe("toPins", () => {
  it("keeps only located groups and exposes exactly the public fields", () => {
    const groups: GroupSummary[] = [
      {
        ...base,
        slug: "koeln",
        name: "BDAS Köln",
        city: "Köln",
        location: { name: "Uni Köln", address: "Albertus-Magnus-Platz", lat: 50.9271, lng: 6.9285 },
      },
      { ...base, id: "grp_2", slug: "essen", name: "BDAS Essen", city: "Essen", location: null },
    ];

    const pins = toPins(groups);

    expect(pins).toHaveLength(1);
    expect(pins[0]).toEqual({
      slug: "koeln",
      name: "BDAS Köln",
      city: "Köln",
      lat: 50.9271,
      lng: 6.9285,
    });
    // Privacy: the location name/address must never reach the client payload.
    expect(Object.keys(pins[0]!).sort()).toEqual(["city", "lat", "lng", "name", "slug"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @bdas/web test`
Expected: FAIL — `./pins` not found.

- [ ] **Step 4: Implement the projection**

`apps/web/app/_groups/pins.ts`:

```ts
import type { GroupSummary } from "@bdas/groups";

export type GroupPin = {
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly lat: number;
  readonly lng: number;
};

/**
 * Public projection for the map. Deliberately excludes the location's
 * name/address — they are editor-facing only (spec: address hidden publicly).
 */
export function toPins(groups: readonly GroupSummary[]): GroupPin[] {
  return groups.flatMap((g) =>
    g.location
      ? [{ slug: g.slug, name: g.name, city: g.city, lat: g.location.lat, lng: g.location.lng }]
      : [],
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bdas/web test`
Expected: PASS.

- [ ] **Step 6: Implement the map component**

`apps/web/app/_groups/GroupMap.tsx` (default export — required for `next/dynamic`):

```tsx
"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

import type { GroupPin } from "./pins";

/** Escape group-controlled strings before they enter Leaflet popup HTML. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Tailwind scans string literals, so these token classes are generated even
// though they only appear inside Leaflet's html option.
const PIN_HTML =
  '<span class="block h-5 w-5 rounded-full border-2 border-bdas-surface bg-bdas-red shadow-bdas-card"></span>';

export default function GroupMap({ pins }: { pins: GroupPin[] }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current || pins.length === 0) return;

    // scrollWheelZoom stays off until the visitor clicks the map, so the
    // landing page never traps page scrolling; +/- buttons and pinch work.
    const map = L.map(el.current, { scrollWheelZoom: false });
    map.once("click", () => map.scrollWheelZoom.enable());

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const icon = L.divIcon({
      className: "",
      html: PIN_HTML,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      popupAnchor: [0, -10],
    });

    for (const p of pins) {
      L.marker([p.lat, p.lng], { icon, alt: p.name })
        .addTo(map)
        .bindPopup(
          `<strong>${esc(p.name)}</strong><br>${esc(p.city)}<br>` +
            `<a href="/gruppen/${encodeURIComponent(p.slug)}">Zur Gruppenseite →</a>`,
        );
    }

    const first = pins[0]!;
    if (pins.length === 1) {
      map.setView([first.lat, first.lng], 10);
    } else {
      map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), {
        padding: [32, 32],
        maxZoom: 12,
      });
    }

    return () => {
      map.remove();
    };
  }, [pins]);

  if (pins.length === 0) return null;
  return (
    <div
      ref={el}
      role="region"
      aria-label="Karte der Hochschulgruppen"
      className="h-72 w-full overflow-hidden rounded-bdas border border-bdas-soft shadow-bdas-card sm:h-[420px]"
    />
  );
}
```

`apps/web/app/_groups/GroupMapLazy.tsx` (client wrapper — `ssr: false` is not allowed directly in Server Components):

```tsx
"use client";

import dynamic from "next/dynamic";

import type { GroupPin } from "./pins";

const GroupMap = dynamic(() => import("./GroupMap"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden="true"
      className="h-72 w-full animate-pulse rounded-bdas border border-bdas-soft bg-bdas-overlay-hover sm:h-[420px]"
    />
  ),
});

export function GroupMapLazy({ pins }: { pins: GroupPin[] }) {
  return <GroupMap pins={pins} />;
}
```

- [ ] **Step 7: Write the ADR**

`docs/decisions/0019-leaflet-for-public-group-map.md`:

```md
# 0019 — Leaflet + OSM raster tiles for the public group map

Date: 2026-07-06
Status: accepted

## Context

The public site needs one interactive Germany map showing each
Hochschulgruppe's location (spec:
docs/superpowers/specs/2026-07-06-group-locations-map-design.md). The pinned
tech stack (CLAUDE.md §2) names no map library.

## Decision

Leaflet (~42 KB) with the free OpenStreetMap raster tile server, loaded
client-side only (`next/dynamic`, `ssr: false`). No API key — matching the
keyless Photon geocoder already used for location search. Markers are custom
divIcons styled with design-system token classes.

## Alternatives rejected

- MapLibre GL: vector rendering, but requires a tile provider (API key,
  quota) and a ~5× larger bundle.
- Custom SVG Germany map: zero third-party requests, but no zoom/pan and
  substantially more design work.

## Consequences

- New deps in apps/web: `leaflet`, `@types/leaflet`.
- Tile requests transmit visitor IPs to the OpenStreetMap Foundation —
  covered by a /datenschutz paragraph (legitimate interest).
- "© OpenStreetMap contributors" attribution is mandatory and rendered by
  the map control.
```

- [ ] **Step 8: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm --filter @bdas/web test`
Expected: clean, pins test PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/app/_groups docs/decisions/0019-leaflet-for-public-group-map.md
git commit -m "feat(web): Leaflet group map component + public pins projection (ADR 0019)"
```

---

### Task 7: Wire the map into the start page and /gruppen

**Files:**

- Modify: `apps/web/app/_public/landing/GruppenBlock.tsx`
- Modify: `apps/web/app/gruppen/page.tsx`

**Interfaces:**

- Consumes: `toPins`, `GroupMapLazy` (Task 6), `isFlagOn("group_map")` (Task 2).
- Behavior contract: flag off **or** zero located groups ⇒ both pages render exactly as before this feature.

- [ ] **Step 1: Start page — map replaces the card grid when it has pins**

Replace `apps/web/app/_public/landing/GruppenBlock.tsx` content with:

```tsx
import Link from "next/link";

import { getDb } from "@bdas/db";
import { Card, Section } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";
import { listGroups } from "@bdas/groups";

import { GroupMapLazy } from "../../_groups/GroupMapLazy";
import { toPins } from "../../_groups/pins";

const MAX_CARDS = 8;

export async function GruppenBlock() {
  const groups = await listGroups(getDb(), { status: "active" });
  const pins = isFlagOn("group_map") ? toPins(groups) : [];
  const shown = groups.slice(0, MAX_CARDS);

  return (
    <Section
      id="gruppen"
      title={`Vor Ort an ${groups.length} Hochschulen`}
      intro="Finde die BDAS-Gruppe an deiner Hochschule."
      action={
        <Link href="/gruppen" className="text-bdas-red hover:underline">
          Alle Gruppen →
        </Link>
      }
    >
      {pins.length > 0 ? (
        <GroupMapLazy pins={pins} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((g) => (
            <li key={g.id}>
              <Link href={`/gruppen/${g.slug}`} className="block focus:outline-none">
                <Card className="h-full p-4">
                  <h3 className="font-semibold text-bdas-ink">{g.name}</h3>
                  <p className="text-sm text-bdas-ink-muted">{g.city}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
```

- [ ] **Step 2: /gruppen — map above the card grid**

In `apps/web/app/gruppen/page.tsx` add imports:

```ts
import { isFlagOn } from "@bdas/feature-flags";

import { GroupMapLazy } from "../_groups/GroupMapLazy";
import { toPins } from "../_groups/pins";
```

Compute after the `listGroups` call:

```ts
const pins = isFlagOn("group_map") ? toPins(groups) : [];
```

Insert between `</header>` and the `{groups.length === 0 ? ...}` block:

```tsx
{
  pins.length > 0 ? <GroupMapLazy pins={pins} /> : null;
}
```

- [ ] **Step 3: Verify (manual smoke)**

Run: `pnpm typecheck && pnpm build`
Expected: build clean. Optionally: `pnpm db:up && pnpm db:migrate`, seed a group with a location (`pnpm groups:seed` data won't have one — instead set one via psql:
`docker compose exec postgres psql -U bdas -d bdas -c "UPDATE groups SET location_lat=50.93, location_lng=6.93, location_name='Uni Köln', location_address='Albertus-Magnus-Platz' WHERE slug='koeln';"`),
then `BDAS_FLAG_GROUP_MAP=true pnpm --filter @bdas/web dev` and check `/` and `/gruppen` show the map; without the env var they show the card grid.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_public/landing/GruppenBlock.tsx apps/web/app/gruppen/page.tsx
git commit -m "feat(web): show group map on start page and /gruppen behind group_map flag"
```

---

### Task 8: Datenschutz paragraph

**Files:**

- Modify: `apps/web/app/datenschutz/page.tsx`

- [ ] **Step 1: Add the OSM paragraph**

In the `<div className="flex flex-col gap-4 text-bdas-ink-body">` block, after the existing cookie paragraph, add:

```tsx
<p>
  Auf der Startseite und der Seite „Hochschulgruppen“ binden wir eine interaktive Karte auf Basis
  von OpenStreetMap ein. Beim Laden der Karte wird Ihre IP-Adresse an Server der OpenStreetMap
  Foundation (St John&apos;s Innovation Centre, Cambridge, Vereinigtes Königreich) übertragen, um
  die Kartenkacheln auszuliefern. Rechtsgrundlage ist unser berechtigtes Interesse an einer
  ansprechenden Darstellung unserer Hochschulgruppen (Art. 6 Abs. 1 lit. f DSGVO).
</p>
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm lint && pnpm typecheck`

```bash
git add apps/web/app/datenschutz/page.tsx
git commit -m "docs(web): Datenschutz paragraph for the OpenStreetMap embed"
```

---

### Task 9: E2E coverage + CI flag

**Files:**

- Modify: `e2e/helpers/db.ts` (`seedGroup`)
- Create: `e2e/group-map.e2e.ts`
- Modify: `.github/workflows/ci.yml` (e2e job env only — the block that already has `BDAS_FLAG_PUBLIC_SHELL`)

**Interfaces:**

- Consumes: helpers `seedGroup`, `uniqueEmail`, `uniqueSlug`, `grantLocalBoard` (`e2e/helpers/db.ts`), flows `registerVerifyLogin`, `createProfile` (`e2e/helpers/flows.ts`).
- Produces: `seedGroup` accepts optional `location?: { name: string; address: string; lat: number; lng: number }`.

- [ ] **Step 1: Extend seedGroup**

In `e2e/helpers/db.ts` replace `seedGroup` with:

```ts
export async function seedGroup(input: {
  slug: string;
  name: string;
  city: string;
  status?: "active" | "dormant" | "new" | "archived";
  contactEmail?: string;
  location?: { name: string; address: string; lat: number; lng: number };
}): Promise<string> {
  const id = `grp_e2e_${rand()}`;
  await sql`
    INSERT INTO groups (id, slug, name, city, status, contact_email,
                        location_name, location_address, location_lat, location_lng)
    VALUES (${id}, ${input.slug}, ${input.name}, ${input.city}, ${input.status ?? "active"},
            ${input.contactEmail ?? null},
            ${input.location?.name ?? null}, ${input.location?.address ?? null},
            ${input.location?.lat ?? null}, ${input.location?.lng ?? null})`;
  return id;
}
```

Below it, add a read helper for the Task 5b regression assertion:

```ts
/** The stored contact email for a group (Task 5b regression check). */
export async function groupContactEmail(slug: string): Promise<string | null> {
  const rows = await sql<{ contact_email: string | null }[]>`
    SELECT contact_email FROM groups WHERE slug = ${slug} LIMIT 1`;
  return rows[0]?.contact_email ?? null;
}
```

- [ ] **Step 2: Write the e2e spec**

`e2e/group-map.e2e.ts`:

```ts
/**
 * Group map: a local_board member sets their group's location through the
 * admin edit form (Photon stubbed), then the public map on /gruppen and the
 * start page shows the pin, whose popup links to the group page.
 * Requires BDAS_FLAG_GROUP_MAP=true (set in the CI e2e job env).
 */
import { expect, test } from "@playwright/test";

import {
  grantLocalBoard,
  groupContactEmail,
  seedGroup,
  uniqueEmail,
  uniqueSlug,
} from "./helpers/db";
import { createProfile, registerVerifyLogin } from "./helpers/flows";

const PHOTON_FIXTURE = {
  features: [
    {
      geometry: { coordinates: [6.9285, 50.9271] },
      properties: { name: "Universität zu Köln", street: "Albertus-Magnus-Platz", city: "Köln" },
    },
  ],
};

test.beforeEach(async ({ page }) => {
  // Hermetic: never talk to photon.komoot.io or the OSM tile servers.
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({ json: PHOTON_FIXTURE }),
  );
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
});

test("local board sets a location; the public map pin links to the group page", async ({
  page,
}) => {
  const slug = uniqueSlug("e2e-karte");
  const groupId = await seedGroup({
    slug,
    name: "E2E Karten Gruppe",
    city: "Köln",
    status: "active",
    contactEmail: "karte@bdas.de",
  });

  const email = uniqueEmail("karte");
  await registerVerifyLogin(page, { email });
  await createProfile(page, {});
  await grantLocalBoard(email, groupId); // takes effect on next request (DB-read grants)

  // Set the location through the admin edit form (Photon is stubbed above).
  await page.goto(`/admin/gruppen/${slug}/bearbeiten`);
  await page.getByLabel("Ort (suchen)").fill("Uni Köln");
  await page.getByRole("button", { name: /Universität zu Köln/ }).click();
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await page.waitForURL("**/admin/gruppen");

  // Task 5b regression: saving the board Profil form must preserve the
  // admin-managed fields AND the stored location.
  await page.goto(`/gruppe/${slug}/profile`);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  expect(await groupContactEmail(slug)).toBe("karte@bdas.de");

  // /gruppen renders the map; the pin's popup links to the group page.
  await page.goto("/gruppen");
  await page.locator(".leaflet-marker-icon").click();
  const popupLink = page.getByRole("link", { name: "Zur Gruppenseite →" });
  await expect(popupLink).toBeVisible();
  await expect(popupLink).toHaveAttribute("href", `/gruppen/${slug}`);

  // The start page block renders the map too.
  await page.goto("/");
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
});
```

Note: `.leaflet-marker-icon` without `.first()` on /gruppen asserts there is exactly ONE located group (strict-mode locator) — this spec is currently the only one that sets locations. If a later spec seeds locations, scope the locator by adding `hasText` on the popup after clicking `.first()` instead.

- [ ] **Step 3: Add the flag to the CI e2e job**

In `.github/workflows/ci.yml`, in the env block that already contains `BDAS_FLAG_PUBLIC_SHELL: "true"` (the e2e job, around line 180), add:

```yaml
BDAS_FLAG_GROUP_MAP: "true"
```

Do NOT add it to the other two env blocks (unit/integration jobs don't render the map).

- [ ] **Step 4: Run the e2e suite locally**

```bash
pnpm db:up && pnpm db:migrate && pnpm --filter @bdas/web build
BDAS_FLAG_AUTH=true BDAS_FLAG_MEMBERS=true BDAS_FLAG_GROUPS=true BDAS_FLAG_EVENTS=true \
BDAS_FLAG_DASHBOARD=true BDAS_FLAG_PUBLIC_SHELL=true BDAS_FLAG_GROUP_MAP=true \
DATABASE_URL=postgres://bdas:bdas@localhost:5432/bdas pnpm e2e
```

(Match any additional env the e2e CI job sets, e.g. `SSO_JWT_SECRET`, `BDAS_FEDERAL_BOARD_EMAILS`, `PUBLIC_SITE_URL` — copy from `.github/workflows/ci.yml`.)
Expected: `group-map.e2e.ts` PASSES and all pre-existing e2e specs still pass (especially `groups-public.e2e.ts` and `public-shell.e2e.ts`, which share the DB).

- [ ] **Step 5: Commit**

```bash
git add e2e .github/workflows/ci.yml
git commit -m "test(e2e): group location via admin form + public map pin popup"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run everything**

```bash
pnpm lint && pnpm typecheck && pnpm db:up && pnpm test && pnpm build
```

Expected: all clean; groups integration tests ran (not skipped).

- [ ] **Step 2: Fix anything that surfaced, amend/commit as needed**

If all green and nothing changed, no commit. Otherwise commit fixes with a `fix:` message.

- [ ] **Step 3: Invoke the superpowers:verification-before-completion skill before claiming done**
