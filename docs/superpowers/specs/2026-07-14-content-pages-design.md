# Editable Content Pages (Puck) — BSR Page First — Design

**Date:** 2026-07-14
**Status:** Approved (brainstormed with product owner)
**Scope:** A generic system for board-editable content pages using the Puck visual editor, with the Bundessprecher\*innenrat (BSR) page as the first page. New `content` module + Puck integration in `apps/web`.

---

## 1. Context and decisions

The federation wants an "Über uns" page presenting the Bundessprecher\*innenrat: each member with a photo, their BSR role, their university, and their degree programme. The board must be able to edit this page themselves in the browser — no code change, no developer.

Decisions made during brainstorming:

- **Generic system, BSR page first.** Pages are stored per slug; Kurzportrait, Verbandsstruktur, and BDAJ (currently placeholder copy waiting on the board) can be switched to editable pages later without new code. Only the BSR page ships now.
- **Puck** (`@puckeditor/core` — formerly published as `@measured/puck` — MIT, ^0.22) is the editor. It is a React visual editor with an official Next.js App Router recipe; it stores a page as a JSON document and renders it with a `<Render>` component. Puck deliberately ships no auth — we gate editing with our existing `federal_board` grant machinery. **This is a new dependency and gets ADR 0023** (the dependency itself plus the deliberate coupling to Puck's JSON document format).
- **Save = live.** Clicking "Veröffentlichen" in the editor writes to the DB and the public page shows it immediately. No draft state, no version history (YAGNI for a team the size of the BSR; revisit if it hurts).
- **BSR member data is free-form content**, not linked to member accounts. The members module knows neither university nor degree programme nor photos, and BSR members need not be dashboard users. The board types the data into the page.
- **URL and nav:** `/ueber-uns/bundessprecherinnenrat`, nav label „Bundessprecher\*innenrat“ in the Über-uns dropdown.

## 2. Goals and non-goals

**In scope:** `content` module (table, service, migration, flag, event) · Puck editor + render integration in `apps/web` · a small German block palette including the person-card grid · photo upload to a public `content-media` bucket · public BSR page + editor route + nav entry · ADR 0023.

**Explicitly out of scope:**

- Draft/publish workflow, version history, concurrent-edit protection (last write wins)
- Converting Kurzportrait / Verbandsstruktur / BDAJ to editable pages (later: enable a slug, no new code)
- Editing rights for anyone below `federal_board` (e.g. per-group pages — a later project)
- A raw-HTML or embed block (structural XSS exclusion — see §6)
- Localisation of the editor beyond German field labels

## 3. `content` module

New module `modules/content`, owning one table:

### `content_pages`

| Column       | Type        | Notes                                           |
| ------------ | ----------- | ----------------------------------------------- |
| `slug`       | text PK     | e.g. `ueber-uns/bundessprecherinnenrat`         |
| `data`       | jsonb       | the Puck document (`{ root, content, zones? }`) |
| `updated_at` | timestamptz | not null, default now                           |
| `updated_by` | text        | user id of the saving actor, not null           |

- Migration lives in `modules/content/migrations/` and is registered in `infra/migrations/manifest.ts`.
- RLS lockdown like the members tables: RLS enabled, no policies — only the service-role connection reads/writes.
- Feature flag `content` added to `core/feature-flags` `FLAGS`. Off in production until acceptance-complete.

### Service surface (via `modules/content/src/index.ts`)

- `getPage(db, slug)` → `{ slug, data, updatedAt } | null`. No auth — page content is public.
- `savePage(db, { slug, data, actor })` where `actor = { userId, grants }`. Throws (typed `core/errors` error) unless the grants include `federal_board`; validates `data` against a zod schema of Puck's `Data` shape; rejects documents over **512 KB** serialized. Upserts, stamps `updated_at` / `updated_by`.
- Emits `content.page.saved` (slug, actor userId) via `core/events`. No consumer yet; the module convention requires typed events.

The route layer resolves the session → member → effective grants (existing `@bdas/members` surface) and passes them in; the **module** makes the authorization decision.

## 4. Puck integration (`apps/web`)

`@puckeditor/core` is a dependency of `apps/web` only — modules and `core/` never import it.

### Block palette — `apps/web/app/_content/puck-config.tsx`

German labels, all styling via design-system tokens (no inline hex/radius/shadow/duration):

- **Überschrift** — text + level (h2/h3).
- **Absatz** — multiline text, rendered as escaped React text.
- **Personen-Raster** — the core block. One array field `personen`; each entry: `foto` (custom upload field), `name`, `rolle` (im BSR), `uni`, `studiengang`. Renders a responsive grid of design-system Cards (12px radius, hover lift per token durations). Reordering via the array field's drag handles.

Keep the palette to exactly these three blocks. Every extra block is maintenance; add more only when a real page needs one.

### Photo upload

A custom Puck field component that:

1. `POST /api/content/upload-url` with `{ filename, mimeType, sizeBytes }` — the route checks flag + session + `federal_board`, validates mime (JPG/PNG/WebP/AVIF) and size (≤ 10 MB), and returns a signed upload URL. Mirrors `apps/web/app/api/events/[id]/upload-url/route.ts`.
2. Uploads the file directly to the signed URL, stores the returned public URL in the field value.

Storage: new public bucket **`content-media`**, exposed via `getContentMediaStorage()` and `contentMediaPublicUrl()` in `core/storage` — exact analogues of the `event-media` pair, env var `SUPABASE_CONTENT_MEDIA_BUCKET` (default `content-media`), documented in `.env.example`. **Owner setup step:** create the public bucket in Supabase once.

Storage keys: `<slug-with-slashes-replaced>/<uuid>.<ext>`. Orphaned images (uploaded then removed from the page) are accepted as harmless litter for now — no sweeper (YAGNI; the files-sweep cron is a pattern to copy if it ever matters).

## 5. Routes and navigation

| Route                                          | Kind                             | Behaviour                                                                                                                                                                                                                          |
| ---------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ueber-uns/bundessprecherinnenrat`            | Server Component, public         | Flag check (`public_shell` + `content`), `getPage(...)`, `<Render config data>`. No row → placeholder „Inhalte folgen in Kürze“. Federal board viewers see a „Seite bearbeiten“ button. Metadata title „Bundessprecher\*innenrat“. |
| `/ueber-uns/bundessprecherinnenrat/bearbeiten` | Server Component → client editor | Server-side session + `federal_board` check, otherwise 404 (`notFound()`). Loads current data, renders the client `<PuckEditor>`. „Veröffentlichen“ → PUT → redirect to the public page.                                           |
| `PUT /api/content/pages/[...slug]`             | Route handler                    | Flag + session + grants resolved, then `savePage`. 401 without session, 403 without `federal_board`, 422 on invalid/oversized data.                                                                                                |
| `POST /api/content/upload-url`                 | Route handler                    | See §4.                                                                                                                                                                                                                            |

The page routes are **hardcoded for the BSR slug** in this iteration; the API and service are slug-generic. Enabling another page later means adding its route (a five-line Server Component) — deliberately not a catch-all route, so only intentionally released slugs are reachable.

**Legacy redirect exception:** `next.config.mjs` redirects unknown `/ueber-uns/:slug` paths to `/ueber-uns` (WordPress legacy map). `bundessprecherinnenrat` must be added to the negative-lookahead exception list, or the new page is unreachable.

**Nav:** new leaf `{ label: "Bundessprecher*innenrat", href: "/ueber-uns/bundessprecherinnenrat" }` in the Über-uns dropdown in `apps/web/app/_public/nav-items.ts`, rendered only when the `content` flag is on. Sitemap entry in `sitemap.ts` under the same condition.

## 6. Security posture

- **Editing:** editor route, save API, and upload API all require an authenticated session whose effective grants include `federal_board`; the module re-checks on save. Non-board users get 404 on the editor route (no existence leak) and 401/403 on the APIs.
- **XSS:** the palette contains no raw-HTML/embed block; all text fields render as React-escaped text inside our components. Puck data is never `dangerouslySetInnerHTML`ed.
- **DoS/abuse:** JSON size cap (512 KB), upload mime/size validation, uploads only via signed URLs minted after the auth check.
- The PR gets **`/security-review`** (auth-adjacent + upload surface) per the working agreement.

## 7. Testing

- **Module (Docker Postgres, real DB):** save/get roundtrip · upsert overwrites · non-board actor rejected · invalid Puck shape rejected · oversized document rejected · `updated_by`/`updated_at` stamped · `content.page.saved` emitted.
- **Web unit:** `nav-items.test.ts` — entry present with flag on + absent with flag off; API route tests for 401 / 403 / 422 / success.
- **e2e (Playwright):** public page renders seeded content; editor route 404s for anonymous and plain-member sessions.

## 8. Rollout

1. Merge behind `content` flag (off in production).
2. Enable flag in preview; board fills in the BSR page content (photos, roles, unis, degrees).
3. Enable flag in production; page and nav entry appear.
