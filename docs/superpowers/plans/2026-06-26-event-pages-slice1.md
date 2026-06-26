# Event Pages — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the bare events page into a proper, formatted, image-capable event page — rich-text body + optional named sections, a cover image, a searchable pinned location button, plus a working admin edit form, a single-event ICS download, and a draft "view as public" preview.

**Architecture:** All new event fields live on the `events` table; rich content is one `content jsonb` document (Tiptap JSON), structured location is four scalar columns, and the cover lives in a new public Supabase Storage bucket `event-media`. The editor is a constrained Tiptap React component (client); the public page renders the stored Tiptap JSON to sanitized HTML server-side via `@tiptap/html` so the editor JS never ships to visitors. This is Slice 1 of 4 from the design spec — one mergeable PR under the existing `events` feature flag.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Components + Server Actions), Drizzle ORM on Postgres, Tailwind + `@bdas/design-system`, Tiptap v2 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/html`, `@tiptap/pm`), `sanitize-html`, Supabase Storage via `@bdas/storage`, Photon geocoder (keyless HTTP), Vitest.

## Global Constraints

- **Module ownership (CLAUDE.md §1):** the `events` module owns `events` / `event_registrations` / `event_attendance`. Only `@bdas/events-module` reads/writes them; `apps/web` uses the exported service surface, never raw SQL on those tables.
- **Public surface = `index.ts` (rule 8):** any new service/type consumed by `apps/web` must be re-exported from `modules/events/src/index.ts`. Internal files stay internal.
- **Migrations namespaced per module (rule 7):** new SQL goes in `modules/events/migrations/`, runs in lexical filename order; the manifest already lists `events`, so no manifest edit.
- **Feature flag (rule 6):** every new route/action checks the existing events flag (`isFlagOn("events")` / `requireEventsFlag()`); no new flag.
- **Events module has no `auth`/`members` dependency (rule 2):** authorization is enforced in the `apps/web` action/page layer (`canManage`, `viewerFrom`), not inside the module's services. Keep it that way.
- **Design tokens only (CLAUDE.md §7):** consume `bdas-*` Tailwind classes / `@bdas/design-system` primitives. Never inline a hex, radius, shadow, or duration.
- **German UI copy:** all user-facing strings in German, matching existing event copy (`Veranstaltung`, `Beginn`, `Sichtbarkeit`, …).
- **Tests ship in the same PR (CLAUDE.md §4):** module logic is integration-tested against real Postgres (the existing `modules/events/src/index.test.ts` pattern: skips when `DATABASE_URL` unreachable, applies migration SQL in dependency order).
- **Storage is signed-URL only (spec §11):** the app never proxies bytes; image uploads use a signed upload URL minted server-side.
- **Deploy safety (ADR 0010):** the migration is additive + backfill only. It does **not** drop `description_md` in this slice (left deprecated/unused to avoid a destructive change during the migrate-on-deploy window).

---

## File map

**`modules/events/` (the module — owns data + serialization):**
- Create `migrations/0002_event_pages.sql` — add `content jsonb`, `cover_image_key`, `summary`, `registration_deadline`, `location_name/_address/_lat/_lng`; backfill `content.body` from `description_md`.
- Modify `src/schema.ts` — add the new columns to the Drizzle table.
- Modify `src/types.ts` — add `TiptapDoc`, `EventContent`, extend `EventItem`.
- Modify `src/services/manage.ts` — extend `EventInput`, `createEvent`, `updateEvent`, `rowToEvent`.
- Create `src/content.ts` — `renderEventContentHtml(doc)` (server-side Tiptap JSON → sanitized HTML) + `plainTextToDoc(text)` helper.
- Create `src/ics.ts` — `eventToIcs(event)` single-event ICS serializer.
- Modify `src/index.ts` — re-export the new types/functions.
- Tests: `src/content.test.ts`, `src/ics.test.ts`, and additions to `src/index.test.ts`.

**`core/storage/` (shared concern — public bucket support):**
- Modify `src/supabase.ts` — add `publicUrl(storageKey)` to `SupabaseStorageClient`.
- Modify `src/index.ts` — add `getEventMediaStorage()` accessor (cached, bucket `event-media`).
- Test: `src/event-media.test.ts`.

**`apps/web/` (consumer UI):**
- Create `app/api/events/[id]/upload-url/route.ts` — POST → signed upload URL into `event-media` (auth-gated by `canManage`).
- Create `app/admin/events/_editor/RichTextEditor.tsx` — Tiptap client editor + toolbar + image upload.
- Create `app/admin/events/_editor/LocationPicker.tsx` — Photon search client component.
- Create `app/admin/events/_editor/EventFields.tsx` — shared form fields (cover, summary, deadline, location, content slots) used by create + edit.
- Modify `app/admin/events/EventForm.tsx` — use `EventFields`; gather new fields.
- Modify `app/admin/events/actions.ts` — `createEventAction` reads new fields; add `updateEventAction`.
- Create `app/admin/events/[id]/edit/page.tsx` — edit form page (board-or-manage gated).
- Modify `app/admin/events/[id]/page.tsx` — link to the edit page + "Vorschau" (view-as-public) link.
- Modify `app/events/[id]/page.tsx` — render cover, content slots (sanitized HTML), location button, ICS link; allow draft preview for managers.
- Create `app/events/[id]/ics/route.ts` — GET → `text/calendar` for one event.
- Create `app/lib/photon.ts` — typed Photon fetch + result mapping (shared, server-usable).

**Dependencies to add** (`modules/events/package.json` and `apps/web/package.json` as noted per task):
- `@tiptap/html`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`, `sanitize-html` → events module (server render) + `@tiptap/react` → apps/web (client editor).

---

## Task 1: DB migration + schema + types for the new fields

**Files:**
- Create: `modules/events/migrations/0002_event_pages.sql`
- Modify: `modules/events/src/schema.ts`
- Modify: `modules/events/src/types.ts`
- Test: `modules/events/src/index.test.ts` (new case)

**Interfaces:**
- Produces: new `events` columns `content` (jsonb), `cover_image_key`, `summary`, `registration_deadline`, `location_name`, `location_address`, `location_lat`, `location_lng`. Drizzle fields `content`, `coverImageKey`, `summary`, `registrationDeadline`, `locationName`, `locationAddress`, `locationLat`, `locationLng`. Types `TiptapDoc`, `EventContent`, extended `EventItem`.

- [ ] **Step 1: Write the migration SQL**

Create `modules/events/migrations/0002_event_pages.sql`:

```sql
-- Events module — proper event pages (Slice 1).
-- Additive only. description_md is retained (deprecated, unused) and backfilled
-- into content.body; a later cleanup migration drops it (ADR 0010 deploy safety).

ALTER TABLE events ADD COLUMN content jsonb;
ALTER TABLE events ADD COLUMN cover_image_key text;
ALTER TABLE events ADD COLUMN summary text;
ALTER TABLE events ADD COLUMN registration_deadline timestamptz;
ALTER TABLE events ADD COLUMN location_name text;
ALTER TABLE events ADD COLUMN location_address text;
ALTER TABLE events ADD COLUMN location_lat double precision;
ALTER TABLE events ADD COLUMN location_lng double precision;

-- Backfill: wrap existing plain-text description into a minimal Tiptap doc at
-- content.body so no copy is lost. Empty/whitespace descriptions stay NULL.
UPDATE events
SET content = jsonb_build_object(
  'body',
  jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(
          jsonb_build_object('type', 'text', 'text', description_md)
        )
      )
    )
  )
)
WHERE description_md IS NOT NULL AND btrim(description_md) <> '';

-- Carry freeform location text into the new structured name field.
UPDATE events
SET location_name = location
WHERE location IS NOT NULL AND btrim(location) <> '';
```

- [ ] **Step 2: Add the columns to the Drizzle table**

In `modules/events/src/schema.ts`, add to the `events` table definition (after `locationUrl`, keeping existing fields):

```typescript
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
```

```typescript
    content: jsonb("content").$type<import("./types").EventContent>(),
    coverImageKey: text("cover_image_key"),
    summary: text("summary"),
    registrationDeadline: timestamp("registration_deadline", { withTimezone: true }),
    locationName: text("location_name"),
    locationAddress: text("location_address"),
    locationLat: doublePrecision("location_lat"),
    locationLng: doublePrecision("location_lng"),
```

(Leave `descriptionMd` in the schema — column still exists.)

- [ ] **Step 3: Add the content + extended item types**

In `modules/events/src/types.ts`, add:

```typescript
/** A Tiptap/ProseMirror document node. Opaque to consumers; rendered server-side. */
export type TiptapDoc = { readonly type: "doc"; readonly content?: ReadonlyArray<unknown> };

/** Structured rich content for an event. Empty slots are omitted on render. */
export type EventContent = {
  readonly body?: TiptapDoc | null;
  readonly agenda?: TiptapDoc | null;
  readonly directions?: TiptapDoc | null;
  readonly bring?: TiptapDoc | null;
};
```

Extend `EventItem` (add after `locationUrl`):

```typescript
  readonly content: EventContent | null;
  readonly coverImageKey: string | null;
  readonly summary: string | null;
  readonly registrationDeadline: Date | null;
  readonly locationName: string | null;
  readonly locationAddress: string | null;
  readonly locationLat: number | null;
  readonly locationLng: number | null;
```

- [ ] **Step 4: Write a failing test that the new columns round-trip**

Add to `modules/events/src/index.test.ts` (apply the new migration in `beforeEach` — add `["..", "migrations", "0002_event_pages.sql"]` to the file list after `0001_init.sql`):

```typescript
  it("stores and reads structured content + cover + location", async () => {
    const ev = await createEvent(
      t.db,
      {
        title: "Stadtführung",
        startsAt: future(),
        summary: "Ein Rundgang durch die Altstadt",
        content: { body: { type: "doc", content: [] } },
        coverImageKey: "evt_x/cover.jpg",
        locationName: "Rathaus",
        locationLat: 51.18,
        locationLng: 6.44,
      },
      "usr_c",
    );
    const got = await getEvent(t.db, ev.id, ACTIVE);
    expect(got?.summary).toBe("Ein Rundgang durch die Altstadt");
    expect(got?.coverImageKey).toBe("evt_x/cover.jpg");
    expect(got?.locationName).toBe("Rathaus");
    expect(got?.locationLat).toBeCloseTo(51.18);
  });
```

- [ ] **Step 5: Run the test — expect FAIL**

Run: `pnpm --filter @bdas/events-module test -- -t "structured content"`
Expected: FAIL — `createEvent` rejects the unknown fields / `getEvent` returns `undefined` for them (the input schema and `rowToEvent` don't handle them yet). This is implemented in Task 2.

- [ ] **Step 6: Commit**

```bash
git add modules/events/migrations/0002_event_pages.sql modules/events/src/schema.ts modules/events/src/types.ts modules/events/src/index.test.ts
git commit -m "feat(events): schema + types for event page fields (content, cover, location)"
```

---

## Task 2: Service layer — accept and return the new fields

**Files:**
- Modify: `modules/events/src/services/manage.ts`
- Test: `modules/events/src/index.test.ts` (the Task 1 case now passes)

**Interfaces:**
- Consumes: schema columns + `EventContent`/`EventItem` from Task 1.
- Produces: `EventInput` accepts `content`, `coverImageKey`, `summary`, `registrationDeadline`, `locationName`, `locationAddress`, `locationLat`, `locationLng`; `createEvent`/`updateEvent` persist them; `rowToEvent` returns them.

- [ ] **Step 1: Extend the `EventInput` zod schema**

In `modules/events/src/services/manage.ts`, add to the `EventInput` object (after `locationUrl`):

```typescript
  summary: z.string().max(300).optional().nullable(),
  // Opaque Tiptap docs; validated structurally, rendered/sanitized at read time.
  content: z
    .object({
      body: z.any().optional().nullable(),
      agenda: z.any().optional().nullable(),
      directions: z.any().optional().nullable(),
      bring: z.any().optional().nullable(),
    })
    .optional()
    .nullable(),
  coverImageKey: z.string().max(400).optional().nullable(),
  registrationDeadline: z.coerce.date().optional().nullable(),
  locationName: z.string().max(240).optional().nullable(),
  locationAddress: z.string().max(400).optional().nullable(),
  locationLat: z.coerce.number().min(-90).max(90).optional().nullable(),
  locationLng: z.coerce.number().min(-180).max(180).optional().nullable(),
```

- [ ] **Step 2: Persist the new fields in `createEvent` and `updateEvent`**

In `createEvent`'s `db.insert(events).values({...})`, add:

```typescript
    summary: v.summary ?? null,
    content: v.content ?? null,
    coverImageKey: v.coverImageKey ?? null,
    registrationDeadline: v.registrationDeadline ?? null,
    locationName: v.locationName ?? null,
    locationAddress: v.locationAddress ?? null,
    locationLat: v.locationLat ?? null,
    locationLng: v.locationLng ?? null,
```

In `updateEvent`'s `.set({...})`, add the same eight lines.

- [ ] **Step 3: Return the new fields from `rowToEvent`**

In `rowToEvent`, add to the returned object (after `locationUrl`):

```typescript
    summary: r.summary,
    content: (r.content as EventContent | null) ?? null,
    coverImageKey: r.coverImageKey,
    registrationDeadline: r.registrationDeadline,
    locationName: r.locationName,
    locationAddress: r.locationAddress,
    locationLat: r.locationLat,
    locationLng: r.locationLng,
```

Import the type at the top: `import type { EventContent, EventItem, EventStatus, EventVisibility } from "../types";`

- [ ] **Step 4: Run the Task 1 test — expect PASS**

Run: `pnpm --filter @bdas/events-module test -- -t "structured content"`
Expected: PASS.

- [ ] **Step 5: Run the full events suite + typecheck**

Run: `pnpm --filter @bdas/events-module test && pnpm --filter @bdas/events-module typecheck`
Expected: PASS (existing cases unaffected; `descriptionMd` still present).

- [ ] **Step 6: Commit**

```bash
git add modules/events/src/services/manage.ts
git commit -m "feat(events): persist event page fields through create/update services"
```

---

## Task 3: Server-side content rendering (Tiptap JSON → sanitized HTML)

**Files:**
- Modify: `modules/events/package.json` (add deps)
- Create: `modules/events/src/content.ts`
- Modify: `modules/events/src/index.ts`
- Test: `modules/events/src/content.test.ts`

**Interfaces:**
- Produces: `renderEventContentHtml(doc: TiptapDoc | null | undefined): string` (returns sanitized HTML, `""` for empty); `plainTextToDoc(text: string): TiptapDoc`. Both re-exported from `index.ts`.

- [ ] **Step 1: Add dependencies**

In `modules/events/package.json` `dependencies`, add:

```json
    "@tiptap/html": "^2.10.0",
    "@tiptap/pm": "^2.10.0",
    "@tiptap/starter-kit": "^2.10.0",
    "@tiptap/extension-image": "^2.10.0",
    "@tiptap/extension-link": "^2.10.0",
    "sanitize-html": "^2.13.0",
```

In `devDependencies` add `"@types/sanitize-html": "^2.13.0"`. Then run `pnpm install`.

- [ ] **Step 2: Write the failing test**

Create `modules/events/src/content.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { plainTextToDoc, renderEventContentHtml } from "./content";

describe("renderEventContentHtml", () => {
  it("returns empty string for null/empty docs", () => {
    expect(renderEventContentHtml(null)).toBe("");
    expect(renderEventContentHtml({ type: "doc", content: [] })).toBe("");
  });

  it("renders headings and bold text", () => {
    const doc = plainTextToDoc("Hallo Welt");
    const html = renderEventContentHtml(doc);
    expect(html).toContain("Hallo Welt");
    expect(html).toContain("<p>");
  });

  it("strips dangerous markup (no script, no onerror)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }],
        },
      ],
    } as const;
    const html = renderEventContentHtml(doc);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script");
  });
});
```

- [ ] **Step 3: Run the test — expect FAIL**

Run: `pnpm --filter @bdas/events-module test -- content.test`
Expected: FAIL — `./content` does not exist.

- [ ] **Step 4: Implement `content.ts`**

Create `modules/events/src/content.ts`:

```typescript
/**
 * Server-side rendering of an event's Tiptap JSON to sanitized HTML.
 *
 * Public event pages are React Server Components; we render here so the editor
 * never ships to visitors. Output is sanitized — stored docs are board-authored
 * but we defend in depth (and guest-era content later).
 */
import { generateHTML } from "@tiptap/html";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import sanitizeHtml from "sanitize-html";

import type { TiptapDoc } from "./types";

const EXTENSIONS = [StarterKit, Image, Link.configure({ openOnClick: false })];

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "u", "s", "h2", "h3", "h4",
    "ul", "ol", "li", "blockquote", "a", "img", "hr",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt"],
  },
  allowedSchemes: ["https", "http", "mailto"],
  allowedSchemesByTag: { img: ["https", "http"] },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
};

function isEmptyDoc(doc: TiptapDoc | null | undefined): boolean {
  return !doc || !doc.content || doc.content.length === 0;
}

export function renderEventContentHtml(doc: TiptapDoc | null | undefined): string {
  if (isEmptyDoc(doc)) return "";
  // generateHTML accepts the ProseMirror JSON shape.
  const raw = generateHTML(doc as Parameters<typeof generateHTML>[0], EXTENSIONS);
  return sanitizeHtml(raw, SANITIZE_OPTS).trim();
}

/** Wrap a plain string as a single-paragraph Tiptap doc (used for previews/seeds). */
export function plainTextToDoc(text: string): TiptapDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  } as TiptapDoc;
}
```

- [ ] **Step 5: Re-export from `index.ts`**

In `modules/events/src/index.ts`, add:

```typescript
export { renderEventContentHtml, plainTextToDoc } from "./content";
export type { TiptapDoc, EventContent } from "./types";
```

- [ ] **Step 6: Run tests + typecheck — expect PASS**

Run: `pnpm --filter @bdas/events-module test -- content.test && pnpm --filter @bdas/events-module typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/events/package.json modules/events/src/content.ts modules/events/src/index.ts pnpm-lock.yaml
git commit -m "feat(events): server-side sanitized rendering of event content"
```

---

## Task 4: Single-event ICS serializer + route

**Files:**
- Create: `modules/events/src/ics.ts`
- Modify: `modules/events/src/index.ts`
- Create: `apps/web/app/events/[id]/ics/route.ts`
- Test: `modules/events/src/ics.test.ts`

**Interfaces:**
- Consumes: `EventItem` (Task 1/2).
- Produces: `eventToIcs(event: Pick<EventItem, "id"|"title"|"summary"|"startsAt"|"endsAt"|"locationName"|"locationAddress">): string` → a valid single-VEVENT iCalendar string. Re-exported from `index.ts`.

- [ ] **Step 1: Write the failing test**

Create `modules/events/src/ics.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { eventToIcs } from "./ics";

describe("eventToIcs", () => {
  it("produces a single VEVENT with required fields", () => {
    const ics = eventToIcs({
      id: "evt_1",
      title: "Sommerfest, BDAS",
      summary: "Treffen",
      startsAt: new Date("2026-08-01T17:00:00Z"),
      endsAt: new Date("2026-08-01T21:00:00Z"),
      locationName: "Rathaus",
      locationAddress: "Markt 1",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:evt_1");
    expect(ics).toContain("DTSTART:20260801T170000Z");
    expect(ics).toContain("DTEND:20260801T210000Z");
    // Commas in text must be escaped per RFC 5545.
    expect(ics).toContain("SUMMARY:Sommerfest\\, BDAS");
    expect(ics).toContain("LOCATION:Rathaus\\, Markt 1");
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("defaults DTEND to start when endsAt is null", () => {
    const ics = eventToIcs({
      id: "evt_2",
      title: "Kurz",
      summary: null,
      startsAt: new Date("2026-08-01T17:00:00Z"),
      endsAt: null,
      locationName: null,
      locationAddress: null,
    });
    expect(ics).toContain("DTEND:20260801T170000Z");
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `pnpm --filter @bdas/events-module test -- ics.test`
Expected: FAIL — `./ics` does not exist.

- [ ] **Step 3: Implement `ics.ts`**

Create `modules/events/src/ics.ts`:

```typescript
/** Minimal RFC 5545 single-event serializer for "add to calendar" downloads. */
import type { EventItem } from "./types";

type IcsInput = Pick<
  EventItem,
  "id" | "title" | "summary" | "startsAt" | "endsAt" | "locationName" | "locationAddress"
>;

function fmt(d: Date): string {
  // UTC basic format: YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function eventToIcs(ev: IcsInput): string {
  const end = ev.endsAt ?? ev.startsAt;
  const location = [ev.locationName, ev.locationAddress].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BDAS//Events//DE",
    "BEGIN:VEVENT",
    `UID:${ev.id}@bdas`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(ev.startsAt)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ...(ev.summary ? [`DESCRIPTION:${esc(ev.summary)}`] : []),
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
```

Note the test asserts `UID:evt_1` via `toContain` — `evt_1@bdas` contains `evt_1`, so it passes.

- [ ] **Step 4: Re-export + run test — expect PASS**

Add to `modules/events/src/index.ts`: `export { eventToIcs } from "./ics";`
Run: `pnpm --filter @bdas/events-module test -- ics.test`
Expected: PASS.

- [ ] **Step 5: Add the web route**

Create `apps/web/app/events/[id]/ics/route.ts`:

```typescript
import { getDb } from "@bdas/db";
import { eventToIcs, getEvent } from "@bdas/events-module";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../lib/event-viewer";
import { getCurrentMember } from "@bdas/members";
import { isFlagOn } from "@bdas/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!isFlagOn("events")) return new Response("Not found", { status: 404 });
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const viewer = viewerFrom(me);
  const event = await getEvent(db, params.id, viewer);
  if (!event) return new Response("Not found", { status: 404 });

  const ics = eventToIcs(event);
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="event-${event.id}.ics"`,
    },
  });
}
```

(Confirm `viewerFrom` accepts a possibly-null member — it's already called that way in `apps/web/app/events/[id]/page.tsx`. If it requires non-null, pass `me ? viewerFrom(me) : ANON` importing `ANON` from `@bdas/events-module`.)

- [ ] **Step 6: Typecheck the web app**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/events/src/ics.ts modules/events/src/ics.test.ts modules/events/src/index.ts "apps/web/app/events/[id]/ics/route.ts"
git commit -m "feat(events): single-event ICS download"
```

---

## Task 5: Public `event-media` bucket support in core/storage

**Files:**
- Modify: `core/storage/src/supabase.ts`
- Modify: `core/storage/src/index.ts`
- Test: `core/storage/src/event-media.test.ts`

**Interfaces:**
- Produces: `SupabaseStorageClient.publicUrl(storageKey: string): string`; `getEventMediaStorage(): SupabaseStorageClient` (cached; bucket from `SUPABASE_EVENT_MEDIA_BUCKET ?? "event-media"`; throws a clear error if `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` missing).

- [ ] **Step 1: Write the failing test**

Create `core/storage/src/event-media.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

import { getEventMediaStorage } from "./index";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  vi.resetModules();
});

describe("getEventMediaStorage", () => {
  it("throws a clear error when storage env is missing", () => {
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    expect(() => getEventMediaStorage()).toThrow(/event-media/i);
  });

  it("builds a public URL for a key when configured", () => {
    process.env["SUPABASE_URL"] = "https://proj.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "svc";
    const url = getEventMediaStorage().publicUrl("evt_1/cover.jpg");
    expect(url).toContain("/storage/v1/object/public/event-media/evt_1/cover.jpg");
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `pnpm --filter @bdas/storage test -- event-media`
Expected: FAIL — `getEventMediaStorage` not exported.

- [ ] **Step 3: Add `publicUrl` to the Supabase client**

In `core/storage/src/supabase.ts`, add a method to `SupabaseStorageClient`:

```typescript
  publicUrl(storageKey: string): string {
    return this.client.storage.from(this.bucket).getPublicUrl(storageKey).data.publicUrl;
  }
```

- [ ] **Step 4: Add the accessor**

In `core/storage/src/index.ts`, after `getStorage`, add:

```typescript
let _eventMedia: SupabaseStorageClient | null = null;

/** Storage client for the public `event-media` bucket (event covers + inline images). */
export function getEventMediaStorage(): SupabaseStorageClient {
  if (_eventMedia) return _eventMedia;
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const bucket = process.env["SUPABASE_EVENT_MEDIA_BUCKET"] ?? "event-media";
  if (!url || !serviceRoleKey) {
    throw new Error(
      "event-media storage is not configured (need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  _eventMedia = new SupabaseStorageClient({ url, serviceRoleKey, bucket });
  return _eventMedia;
}
```

- [ ] **Step 5: Run test + typecheck — expect PASS**

Run: `pnpm --filter @bdas/storage test -- event-media && pnpm --filter @bdas/storage typecheck`
Expected: PASS.

- [ ] **Step 6: Document the bucket in env example**

Add to root `.env.example` (and note in `modules/events/README.md` later): `SUPABASE_EVENT_MEDIA_BUCKET=event-media`. The bucket must be created in Supabase as **public read**, with allowed MIME types `image/*` and a size cap — a manual ops step, recorded in the PR description.

- [ ] **Step 7: Commit**

```bash
git add core/storage/src/supabase.ts core/storage/src/index.ts core/storage/src/event-media.test.ts .env.example
git commit -m "feat(storage): public event-media bucket accessor + publicUrl"
```

---

## Task 6: Signed upload-URL route for event images

**Files:**
- Create: `apps/web/app/api/events/[id]/upload-url/route.ts`
- Test: covered by manual verification (route is thin glue over `getEventMediaStorage` + `canManage`, both unit-tested already).

**Interfaces:**
- Consumes: `getEventMediaStorage()` (Task 5), `canManage` + `getEvent` + `viewerFrom`.
- Produces: `POST /api/events/:id/upload-url` body `{ filename, mimeType, sizeBytes }` → `{ uploadUrl, publicUrl, storageKey }`. Used by the editor (Task 7).

- [ ] **Step 1: Implement the route**

Create `apps/web/app/api/events/[id]/upload-url/route.ts`:

```typescript
import { getDb } from "@bdas/db";
import { canManage, getEvent } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { getEventMediaStorage } from "@bdas/storage";

import { readSessionCookie } from "../../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../../lib/event-viewer";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB cap for event imagery
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isFlagOn("events")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  const viewer = viewerFrom(me);
  const event = await getEvent(db, params.id, viewer);
  if (!event || !canManage(viewer, event)) {
    return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { filename?: string; mimeType?: string; sizeBytes?: number }
    | null;
  if (!body?.mimeType || !ALLOWED.has(body.mimeType)) {
    return Response.json({ error: "Nur Bilddateien (JPG, PNG, WebP, AVIF)." }, { status: 422 });
  }
  if (!body.sizeBytes || body.sizeBytes <= 0 || body.sizeBytes > MAX_BYTES) {
    return Response.json({ error: "Datei zu groß (max. 10 MB)." }, { status: 422 });
  }

  const ext = (body.filename?.split(".").pop() ?? "img").toLowerCase().replace(/[^a-z0-9]/g, "");
  const storageKey = `${event.id}/${crypto.randomUUID()}.${ext}`;
  const storage = getEventMediaStorage();
  const signed = await storage.signedUploadUrl({
    storageKey,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
  });
  return Response.json({
    uploadUrl: signed.url,
    publicUrl: storage.publicUrl(storageKey),
    storageKey,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/events/[id]/upload-url/route.ts"
git commit -m "feat(web): signed upload-url route for event images (board/manage gated)"
```

---

## Task 7: Tiptap rich-text editor component

**Files:**
- Modify: `apps/web/package.json` (add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/pm`)
- Create: `apps/web/app/admin/events/_editor/RichTextEditor.tsx`
- Test: manual (client component; behavior verified in browser at Task 11).

**Interfaces:**
- Produces: `RichTextEditor({ name, defaultDoc, eventId })` — a controlled editor that writes its Tiptap JSON into a hidden `<input name={name}>` as a JSON string on every change, so the surrounding `<form>` submits it. Uses `POST /api/events/:eventId/upload-url` for image insertion.

- [ ] **Step 1: Add deps**

In `apps/web/package.json` `dependencies` add:

```json
    "@tiptap/react": "^2.10.0",
    "@tiptap/pm": "^2.10.0",
    "@tiptap/starter-kit": "^2.10.0",
    "@tiptap/extension-image": "^2.10.0",
    "@tiptap/extension-link": "^2.10.0",
```

Run `pnpm install`.

- [ ] **Step 2: Implement the editor**

Create `apps/web/app/admin/events/_editor/RichTextEditor.tsx`:

```tsx
"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useState } from "react";

import type { TiptapDoc } from "@bdas/events-module";

const BTN =
  "rounded-bdas-inner px-2 py-1 text-sm text-bdas-ink-body hover:bg-bdas-soft/40 " +
  "transition-colors duration-bdas-quick ease-bdas data-[active=true]:bg-bdas-soft";

export function RichTextEditor({
  name,
  defaultDoc,
  eventId,
}: {
  name: string;
  defaultDoc: TiptapDoc | null;
  eventId: string;
}) {
  const [json, setJson] = useState<string>(defaultDoc ? JSON.stringify(defaultDoc) : "");
  const editor = useEditor({
    extensions: [StarterKit, Image, Link.configure({ openOnClick: false })],
    content: defaultDoc ?? "",
    immediatelyRender: false,
    onUpdate: ({ editor }) => setJson(JSON.stringify(editor.getJSON())),
    editorProps: {
      attributes: {
        class:
          "prose max-w-none min-h-[8rem] rounded-bdas border border-bdas-soft bg-bdas-surface " +
          "px-3 py-2.5 focus:border-bdas-red focus:outline-none",
      },
    },
  });

  const addImage = useCallback(async () => {
    if (!editor) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const res = await fetch(`/api/events/${eventId}/upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Upload fehlgeschlagen." }));
        alert(error ?? "Upload fehlgeschlagen.");
        return;
      }
      const { uploadUrl, publicUrl } = await res.json();
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) {
        alert("Upload fehlgeschlagen.");
        return;
      }
      editor.chain().focus().setImage({ src: publicUrl }).run();
    };
    input.click();
  }, [editor, eventId]);

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={json} />
      <div className="flex flex-wrap gap-1 border-b border-bdas-soft pb-2">
        <button type="button" className={BTN} data-active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}>Fett</button>
        <button type="button" className={BTN} data-active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}>Kursiv</button>
        <button type="button" className={BTN} data-active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" className={BTN} data-active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
        <button type="button" className={BTN} data-active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}>Liste</button>
        <button type="button" className={BTN}
          onClick={() => {
            const url = window.prompt("Link-URL (https://…)") ?? "";
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}>Link</button>
        <button type="button" className={BTN} onClick={addImage}>Bild</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
```

(`immediatelyRender: false` avoids the Next SSR hydration warning Tiptap raises in App Router. `data-active` styling consumes the `bdas-soft` token.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/app/admin/events/_editor/RichTextEditor.tsx pnpm-lock.yaml
git commit -m "feat(web): Tiptap rich-text editor with image upload for events"
```

---

## Task 8: Location picker (Photon) component + shared fetch helper

**Files:**
- Create: `apps/web/app/lib/photon.ts`
- Create: `apps/web/app/admin/events/_editor/LocationPicker.tsx`
- Test: `apps/web/app/lib/photon.test.ts`

**Interfaces:**
- Produces: `searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]>` where `PlaceResult = { name: string; address: string; lat: number; lng: number }`; `LocationPicker({ defaultValue })` writing hidden inputs `locationName`, `locationAddress`, `locationLat`, `locationLng`.

- [ ] **Step 1: Write the failing test for the result mapper**

Create `apps/web/app/lib/photon.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { mapPhotonFeature } from "./photon";

describe("mapPhotonFeature", () => {
  it("maps a Photon GeoJSON feature to a PlaceResult", () => {
    const r = mapPhotonFeature({
      geometry: { coordinates: [6.44, 51.18] },
      properties: { name: "Rathaus", street: "Markt", housenumber: "1", city: "Mönchengladbach" },
    });
    expect(r).toEqual({
      name: "Rathaus",
      address: "Markt 1, Mönchengladbach",
      lat: 51.18,
      lng: 6.44,
    });
  });

  it("falls back to city for name when name is absent", () => {
    const r = mapPhotonFeature({
      geometry: { coordinates: [6.0, 51.0] },
      properties: { city: "Köln" },
    });
    expect(r.name).toBe("Köln");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter web test -- photon`
Expected: FAIL — `./photon` not found. (If `web` has no test script, add `"test": "vitest run"` to `apps/web/package.json` and a minimal `vitest.config.ts`; mirror another app/module's config.)

- [ ] **Step 3: Implement `photon.ts`**

Create `apps/web/app/lib/photon.ts`:

```typescript
/** Keyless OpenStreetMap geocoding via Photon (https://photon.komoot.io). */
export type PlaceResult = {
  readonly name: string;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
};

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    country?: string;
  };
};

export function mapPhotonFeature(f: Feature): PlaceResult {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const address = [street, p.city].filter(Boolean).join(", ");
  return {
    name: p.name ?? p.city ?? street ?? "Unbekannter Ort",
    address,
    lat,
    lng,
  };
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  if (query.trim().length < 3) return [];
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=de`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: Feature[] };
  return (data.features ?? []).map(mapPhotonFeature);
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter web test -- photon`
Expected: PASS.

- [ ] **Step 5: Implement `LocationPicker.tsx`**

Create `apps/web/app/admin/events/_editor/LocationPicker.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

import { Field, Input } from "@bdas/design-system";

import { searchPlaces, type PlaceResult } from "../../../lib/photon";

export function LocationPicker({
  defaultValue,
}: {
  defaultValue: { name: string; address: string; lat: number | null; lng: number | null } | null;
}) {
  const [selected, setSelected] = useState<PlaceResult | null>(
    defaultValue && defaultValue.lat !== null && defaultValue.lng !== null
      ? { name: defaultValue.name, address: defaultValue.address, lat: defaultValue.lat, lng: defaultValue.lng }
      : null,
  );
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [q, setQ] = useState(defaultValue?.name ?? "");
  const abort = useRef<AbortController | null>(null);

  async function onChange(value: string) {
    setQ(value);
    setSelected(null);
    abort.current?.abort();
    abort.current = new AbortController();
    setResults(await searchPlaces(value, abort.current.signal).catch(() => []));
  }

  return (
    <Field label="Ort (suchen)" htmlFor="locationSearch" hint="Adresse oder Ort eingeben und auswählen.">
      <Input
        id="locationSearch"
        value={q}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      {results.length > 0 && !selected ? (
        <ul className="mt-1 rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-soft">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-bdas-soft/40"
                onClick={() => {
                  setSelected(r);
                  setQ(r.name);
                  setResults([]);
                }}
              >
                <span className="text-bdas-ink">{r.name}</span>
                {r.address ? <span className="text-bdas-ink-muted"> — {r.address}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <p className="mt-1 text-sm text-bdas-ink-muted">📍 {selected.name}{selected.address ? `, ${selected.address}` : ""}</p>
      ) : null}
      <input type="hidden" name="locationName" value={selected?.name ?? ""} />
      <input type="hidden" name="locationAddress" value={selected?.address ?? ""} />
      <input type="hidden" name="locationLat" value={selected?.lat ?? ""} />
      <input type="hidden" name="locationLng" value={selected?.lng ?? ""} />
    </Field>
  );
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter web typecheck`
Expected: PASS.

```bash
git add apps/web/app/lib/photon.ts apps/web/app/lib/photon.test.ts apps/web/app/admin/events/_editor/LocationPicker.tsx
git commit -m "feat(web): keyless Photon location search + picker"
```

---

## Task 9: Wire create + edit forms to the new fields

**Files:**
- Create: `apps/web/app/admin/events/_editor/EventFields.tsx`
- Modify: `apps/web/app/admin/events/EventForm.tsx`
- Modify: `apps/web/app/admin/events/actions.ts`
- Create: `apps/web/app/admin/events/[id]/edit/page.tsx`
- Modify: `apps/web/app/admin/events/[id]/page.tsx`

**Interfaces:**
- Consumes: `RichTextEditor`, `LocationPicker` (Tasks 7–8); `updateEvent`, `EventInput` (Task 2).
- Produces: `EventFields({ eventId, defaults })` shared field set; `updateEventAction(prev, fd)` server action; the edit page route.

- [ ] **Step 1: Add `updateEventAction` and field parsing helpers**

In `apps/web/app/admin/events/actions.ts`, add a JSON-or-null helper and the action:

```typescript
import { updateEvent } from "@bdas/events-module";

function jsonOpt(fd: FormData, k: string): unknown {
  const v = s(fd, k);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
function numOpt(fd: FormData, k: string): string | null {
  const v = s(fd, k);
  return v === "" ? null : v;
}

function eventFieldsFromForm(fd: FormData, groupId: string | null) {
  return {
    title: s(fd, "title"),
    summary: opt(fd, "summary"),
    content: {
      body: jsonOpt(fd, "content.body"),
      agenda: jsonOpt(fd, "content.agenda"),
      directions: jsonOpt(fd, "content.directions"),
      bring: jsonOpt(fd, "content.bring"),
    },
    coverImageKey: opt(fd, "coverImageKey"),
    startsAt: s(fd, "startsAt"),
    endsAt: opt(fd, "endsAt"),
    registrationDeadline: opt(fd, "registrationDeadline"),
    locationName: opt(fd, "locationName"),
    locationAddress: opt(fd, "locationAddress"),
    locationLat: numOpt(fd, "locationLat"),
    locationLng: numOpt(fd, "locationLng"),
    capacity: opt(fd, "capacity"),
    visibility: s(fd, "visibility") || "members_only",
    groupId,
  };
}
```

Replace the inline object in `createEventAction`'s `createEvent(getDb(), {...}, me.user.id)` call with `createEvent(getDb(), eventFieldsFromForm(fd, groupId), me.user.id)`.

Add the update action:

```typescript
export async function updateEventAction(_prev: EventFormState, fd: FormData): Promise<EventFormState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = s(fd, "eventId");
  try {
    await assertManageable(eventId);
    const groupId = opt(fd, "groupId");
    await updateEvent(getDb(), eventId, eventFieldsFromForm(fd, groupId));
  } catch (err) {
    if (isAppError(err)) {
      const fields = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return fields ? { error: err.message, fields } : { error: err.message };
    }
    throw err;
  }
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  redirect(`/admin/events/${eventId}`);
}
```

- [ ] **Step 2: Build the shared `EventFields` component**

Create `apps/web/app/admin/events/_editor/EventFields.tsx` — extracts the form fields shared by create/edit, including the cover-image upload (reuses the same upload route), summary, deadline, the rich-text slots, and the location picker. Cover upload here is a small client control storing the returned key into a hidden `coverImageKey` input:

```tsx
"use client";

import { useState } from "react";

import { Field, Input } from "@bdas/design-system";
import type { EventContent } from "@bdas/events-module";

import { LocationPicker } from "./LocationPicker";
import { RichTextEditor } from "./RichTextEditor";

const SELECT_CLASS =
  "block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2.5 " +
  "text-base text-bdas-ink focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20";

export type EventDefaults = {
  eventId: string;
  title: string;
  summary: string | null;
  content: EventContent | null;
  coverImageKey: string | null;
  startsAtLocal: string;
  endsAtLocal: string;
  registrationDeadlineLocal: string;
  capacity: number | null;
  visibility: string;
  location: { name: string; address: string; lat: number | null; lng: number | null } | null;
  groups: ReadonlyArray<{ id: string; name: string }>;
  allowFederation: boolean;
  groupId: string | null;
  errors?: Record<string, string>;
};

export function EventFields({ d }: { d: EventDefaults }) {
  const [coverKey, setCoverKey] = useState(d.coverImageKey ?? "");
  const [coverBusy, setCoverBusy] = useState(false);

  async function uploadCover(file: File) {
    setCoverBusy(true);
    try {
      const res = await fetch(`/api/events/${d.eventId}/upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) {
        alert((await res.json().catch(() => ({}))).error ?? "Upload fehlgeschlagen.");
        return;
      }
      const { uploadUrl, storageKey } = await res.json();
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) {
        alert("Upload fehlgeschlagen.");
        return;
      }
      setCoverKey(storageKey);
    } finally {
      setCoverBusy(false);
    }
  }

  return (
    <>
      <Field label="Titel" htmlFor="title" error={d.errors?.["title"]}>
        <Input id="title" name="title" defaultValue={d.title} required />
      </Field>

      <Field label="Kurzbeschreibung (optional)" htmlFor="summary" hint="1–2 Sätze für die Übersicht.">
        <Input id="summary" name="summary" defaultValue={d.summary ?? ""} maxLength={300} />
      </Field>

      <Field label="Titelbild (optional)" htmlFor="cover">
        <input id="cover" type="file" accept="image/*" disabled={coverBusy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCover(f); }} />
        <input type="hidden" name="coverImageKey" value={coverKey} />
        {coverKey ? <p className="mt-1 text-sm text-bdas-ink-muted">Bild gespeichert.</p> : null}
      </Field>

      <Field label="Beginn" htmlFor="startsAt" error={d.errors?.["startsAt"]}>
        <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={d.startsAtLocal} required />
      </Field>
      <Field label="Ende (optional)" htmlFor="endsAt" error={d.errors?.["endsAt"]}>
        <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={d.endsAtLocal} />
      </Field>
      <Field label="Anmeldeschluss (optional)" htmlFor="registrationDeadline">
        <Input id="registrationDeadline" name="registrationDeadline" type="datetime-local"
          defaultValue={d.registrationDeadlineLocal} />
      </Field>

      <LocationPicker defaultValue={d.location} />

      <Field label="Beschreibung" htmlFor="content.body">
        <RichTextEditor name="content.body" eventId={d.eventId} defaultDoc={d.content?.body ?? null} />
      </Field>
      <Field label="Ablauf (optional)" htmlFor="content.agenda">
        <RichTextEditor name="content.agenda" eventId={d.eventId} defaultDoc={d.content?.agenda ?? null} />
      </Field>
      <Field label="Anfahrt (optional)" htmlFor="content.directions">
        <RichTextEditor name="content.directions" eventId={d.eventId} defaultDoc={d.content?.directions ?? null} />
      </Field>
      <Field label="Mitbringen (optional)" htmlFor="content.bring">
        <RichTextEditor name="content.bring" eventId={d.eventId} defaultDoc={d.content?.bring ?? null} />
      </Field>

      <Field label="Kapazität (optional)" htmlFor="capacity" hint="Leer lassen = unbegrenzt." error={d.errors?.["capacity"]}>
        <Input id="capacity" name="capacity" type="number" min={1} defaultValue={d.capacity ?? ""} />
      </Field>

      <Field label="Sichtbarkeit" htmlFor="visibility" error={d.errors?.["visibility"]}>
        <select id="visibility" name="visibility" defaultValue={d.visibility} className={SELECT_CLASS}>
          <option value="public">Öffentlich</option>
          <option value="members_only">Nur Mitglieder</option>
          <option value="group_only">Nur Gruppe</option>
        </select>
      </Field>

      <Field label="Gruppe" htmlFor="groupId" error={d.errors?.["groupId"]}>
        <select id="groupId" name="groupId" defaultValue={d.groupId ?? (d.allowFederation ? "" : d.groups[0]?.id ?? "")} className={SELECT_CLASS}>
          {d.allowFederation ? <option value="">Föderationsweit</option> : null}
          {d.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </Field>
    </>
  );
}
```

**Note on cover upload before create:** the create form has no `eventId` yet, so the upload route (which gates on an existing event) can't mint a URL. Resolve by making media **edit-only**, gated on `d.eventId !== ""` (no new prop): in `EventFields`, render the cover `<Field>` only when `d.eventId !== ""`, and in `RichTextEditor` guard `addImage` to `alert("Bitte zuerst speichern, dann Bilder hinzufügen.")` when `eventId === ""`. In the create flow (`EventForm`) pass `eventId: ""` and show a hint above the body editor: "Titelbild und Bilder im Text nach dem Anlegen im Bearbeiten-Schritt hinzufügen." This keeps the upload route's auth model intact (no pre-event uploads).

- [ ] **Step 3: Point `EventForm` at `EventFields`**

Rewrite `apps/web/app/admin/events/EventForm.tsx` to render `<Form action={action}>` with `<EventFields d={...} />` (build `EventDefaults` with empty/blank defaults, `eventId: ""`, `showMedia: false`) plus the submit button. Keep `useFormState(createEventAction, initialState)` and surface `state.error`.

- [ ] **Step 4: Build the edit page**

Create `apps/web/app/admin/events/[id]/edit/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Card, Form, Button } from "@bdas/design-system";
import { canManage, getEvent } from "@bdas/events-module";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { requireEventsFlag } from "../../../../_events/flag";
import { readSessionCookie } from "../../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../../lib/event-viewer";
import { EventEditForm } from "./EventEditForm";

export const metadata = { title: "Veranstaltung bearbeiten" };

function toLocal(d: Date | null): string {
  if (!d) return "";
  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export default async function EditEventPage({ params }: { params: { id: string } }) {
  requireEventsFlag();
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");
  const viewer = viewerFrom(me);
  const event = await getEvent(db, params.id, viewer);
  if (!event || !canManage(viewer, event)) notFound();

  const allGroups = await listGroups(db, { status: "active" });
  const groups = viewer.isFederal ? allGroups : allGroups.filter((g) => viewer.boardGroupIds.includes(g.id));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Veranstaltung bearbeiten</h1>
      <Card flat className="p-6">
        <EventEditForm
          d={{
            eventId: event.id,
            title: event.title,
            summary: event.summary,
            content: event.content,
            coverImageKey: event.coverImageKey,
            startsAtLocal: toLocal(event.startsAt),
            endsAtLocal: toLocal(event.endsAt),
            registrationDeadlineLocal: toLocal(event.registrationDeadline),
            capacity: event.capacity,
            visibility: event.visibility,
            location: event.locationName
              ? { name: event.locationName, address: event.locationAddress ?? "", lat: event.locationLat, lng: event.locationLng }
              : null,
            groups: groups.map((g) => ({ id: g.id, name: g.name })),
            allowFederation: viewer.isFederal,
            groupId: event.groupId,
          }}
        />
      </Card>
    </main>
  );
}
```

Create the sibling client form `apps/web/app/admin/events/[id]/edit/EventEditForm.tsx`:

```tsx
"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Form } from "@bdas/design-system";

import { updateEventAction, type EventFormState } from "../../actions";
import { EventFields, type EventDefaults } from "../../_editor/EventFields";

export function EventEditForm({ d }: { d: Omit<EventDefaults, "errors"> }) {
  const [state, action] = useFormState(updateEventAction, {} as EventFormState);
  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <input type="hidden" name="eventId" value={d.eventId} />
      <EventFields d={{ ...d, errors: state.fields }} />
      <Submit />
    </Form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Wird gespeichert…" : "Speichern"}</Button>;
}
```

- [ ] **Step 5: Add edit + preview links to the manage page**

In `apps/web/app/admin/events/[id]/page.tsx`, add inside the manage card (above `ManageButtons`):

```tsx
      <div className="flex gap-3">
        <Link href={`/admin/events/${event.id}/edit`} className="text-sm text-bdas-red hover:underline">
          Bearbeiten
        </Link>
        <Link href={`/events/${event.id}?vorschau=1`} className="text-sm text-bdas-red hover:underline">
          Vorschau ansehen
        </Link>
      </div>
```

- [ ] **Step 6: Typecheck the web app**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/admin/events
git commit -m "feat(web): event create/edit forms with rich content, cover, location, deadline"
```

---

## Task 10: Public event page — render cover, content, location button, ICS, preview

**Files:**
- Modify: `apps/web/app/events/[id]/page.tsx`

**Interfaces:**
- Consumes: `renderEventContentHtml`, `getEventMediaStorage().publicUrl`, `eventToIcs` route, `canManage`, draft preview via `?vorschau=1`.

- [ ] **Step 1: Replace the plain-text description block with rendered content + cover + location**

In `apps/web/app/events/[id]/page.tsx`:

1. Allow managers to preview drafts. After computing `event`, if `getEvent` returned null but the viewer can manage, this is already handled (managers see drafts via `canManage` in `canView`). The `?vorschau=1` flag is just a UI affordance; no gating change needed because `canView` already returns true for managers on drafts. Add a small banner when `event.status !== "published"`:

```tsx
import { renderEventContentHtml } from "@bdas/events-module";
import { getEventMediaStorage } from "@bdas/storage";
```

2. Cover image (above the header):

```tsx
      {event.coverImageKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getEventMediaStorage().publicUrl(event.coverImageKey)}
          alt=""
          className="mb-2 w-full rounded-bdas-card object-cover"
        />
      ) : null}
```

3. Draft banner:

```tsx
      {event.status !== "published" ? (
        <Alert variant="info" title="Vorschau">
          Diese Veranstaltung ist noch nicht veröffentlicht. Nur Verwalter sehen diese Seite.
        </Alert>
      ) : null}
```

4. Replace the existing description card with rendered slots:

```tsx
      {renderSlot("Beschreibung", event.content?.body)}
      {renderSlot("Ablauf", event.content?.agenda)}
      {renderSlot("Anfahrt", event.content?.directions)}
      {renderSlot("Mitbringen", event.content?.bring)}
```

where, near the top of the module (server component file), define:

```tsx
function renderSlot(heading: string, doc: Parameters<typeof renderEventContentHtml>[0]) {
  const html = renderEventContentHtml(doc);
  if (!html) return null;
  return (
    <Card flat className="p-6">
      <h2 className="mb-2 text-lg font-semibold text-bdas-ink">{heading}</h2>
      <div className="prose max-w-none text-bdas-ink-body" dangerouslySetInnerHTML={{ __html: html }} />
    </Card>
  );
}
```

(`dangerouslySetInnerHTML` is safe here: the HTML was sanitized in `renderEventContentHtml`.)

5. Location button (in the header area, replacing the bare `event.location` line):

```tsx
        {event.locationName ? (
          <a
            href={
              event.locationLat !== null && event.locationLng !== null
                ? `https://www.google.com/maps/search/?api=1&query=${event.locationLat},${event.locationLng}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.locationName)}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 rounded-bdas border border-bdas-soft px-3 py-1.5 text-sm text-bdas-ink-body hover:bg-bdas-soft/40"
          >
            📍 {event.locationName} — Route öffnen
          </a>
        ) : null}
```

6. "Add to calendar" link (near the registration card):

```tsx
        <a href={`/events/${event.id}/ics`} className="text-sm text-bdas-red hover:underline">
          Zum Kalender hinzufügen
        </a>
```

- [ ] **Step 2: Honor the registration deadline (display + gate)**

In the registration card, if `event.registrationDeadline` is set and in the past, show a closed notice instead of `RegisterControls`:

```tsx
        {event.registrationDeadline && event.registrationDeadline < new Date() ? (
          <Alert variant="info">Die Anmeldefrist ist abgelaufen.</Alert>
        ) : (
          /* existing RegisterControls / login alert block */
        )}
```

(Server-side enforcement of the deadline in `registerMember` is **Slice 2**; this slice gates the UI only. Note this divergence in the PR.)

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS (build confirms `dangerouslySetInnerHTML`, dynamic routes, and `getEventMediaStorage()` usage compile; the `event-media` env may be unset in CI — `publicUrl` only throws when the env is missing AND a cover key exists, so seed/test events without covers build fine).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/events/[id]/page.tsx"
git commit -m "feat(web): rich public event page — cover, content slots, location button, ICS, preview"
```

---

## Task 11: Dashboard event rows link into the manage home

**Files:**
- Modify: `apps/web/app/(board)/_components/EventsTable.tsx`

**Interfaces:**
- Produces: each event row links to `/admin/events/<id>`.

- [ ] **Step 1: Make the title cell a link**

In `apps/web/app/(board)/_components/EventsTable.tsx`, wrap the title cell content in a `next/link` to `/admin/events/${e.id}`:

```tsx
import Link from "next/link";
```

```tsx
              <td className="p-3">
                <Link href={`/admin/events/${e.id}`} className="text-bdas-red hover:underline">
                  {e.title}
                </Link>
              </td>
```

(Match the existing row/column structure — replace only the title `<td>` body.)

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter web typecheck`
Expected: PASS.

```bash
git add "apps/web/app/(board)/_components/EventsTable.tsx"
git commit -m "feat(web): link dashboard event rows into the manage page"
```

---

## Task 12: Module README + full-suite verification

**Files:**
- Modify: `modules/events/README.md`
- Verify: whole workspace.

- [ ] **Step 1: Document the new surface in the README**

Add to `modules/events/README.md`: the new `content`/cover/location/deadline columns, the `event-media` public bucket (and the manual Supabase bucket-creation step: public read, `image/*`, 10 MB cap), `renderEventContentHtml`, `eventToIcs`, and the deploy note that `description_md` is retained-but-deprecated pending a cleanup migration.

- [ ] **Step 2: Run the full gates**

Run:
```bash
pnpm -w typecheck
pnpm -w lint
pnpm --filter @bdas/events-module test
pnpm --filter @bdas/storage test
pnpm --filter web test
```
Expected: all PASS (DB-backed tests skip gracefully if no `DATABASE_URL`, run in CI with Postgres).

- [ ] **Step 3: Manual browser verification (record findings in the PR)**

With the events flag on and `event-media` bucket created: create a draft event → on its edit page upload a cover + add a heading/bold/inline image in the body → search and select a location → save → open `Vorschau ansehen` and confirm cover, formatted body, location button (opens Google Maps), and "Zum Kalender hinzufügen" (downloads a valid `.ics`). Confirm a non-manager 404s on the draft.

- [ ] **Step 4: Commit**

```bash
git add modules/events/README.md
git commit -m "docs(events): document event page surface + event-media bucket"
```

---

## Self-review notes (coverage against the spec, Slice 1 scope)

- **Tiptap editor + inline images + cover:** Tasks 5–9 (bucket, upload route, editor, fields).
- **Structured fields (summary, deadline) + content slots:** Tasks 1–2 (data), 9 (form), 10 (render).
- **Photon location → keyless Maps button:** Tasks 8, 10.
- **Server-side sanitized rendering:** Task 3, consumed in Task 10.
- **Single-event ICS:** Task 4.
- **Draft "view as public" preview:** Tasks 9 (link) + 10 (banner; gating already exists via `canView`).
- **Edit form (gap found in code):** Task 9.
- **Dashboard rows link into manage home:** Task 11.
- **Deliberate Slice-1 divergences (note in PR):** (1) `description_md` retained, not dropped (ADR 0010 deploy safety); (2) cover/inline image upload is edit-only (the upload route gates on an existing event, so no pre-create uploads); (3) registration-deadline enforcement is UI-only this slice — server-side enforcement in `registerMember` lands in Slice 2; (4) `allow_guest_registration` is **not** added here — it belongs to the Slice 4 migration.
- **Out of Slice 1 (later slices):** roster/management/CSV/email/change-notifications (Slice 2), `event_organizer` role (Slice 3), guest registration (Slice 4).
