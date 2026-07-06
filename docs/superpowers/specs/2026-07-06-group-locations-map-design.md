# Group locations + interactive map — design

Date: 2026-07-06
Status: approved (brainstorming session)

## Goal

Each Hochschulgruppe can set a location (searched via the existing keyless Photon/
OpenStreetMap geocoder). Those locations feed one interactive Germany map on the
start page and on `/gruppen`; clicking a pin opens a popup that links to the
group's public page `/gruppen/[slug]`.

## Decisions made

| Question | Decision |
| --- | --- |
| Who can set a group's location | Both: group leads via the board "Profil" form AND federal/local board via `/admin/gruppen/[slug]/bearbeiten` |
| Where the map appears | Start page (`GruppenBlock`) and `/gruppen` overview. **Not** on individual group pages |
| Pin precision / public display | Exact coordinates from the searched place, but the street address is never rendered publicly — popup shows group name + city only |
| Pin click behavior | Popup first (name, city, "Zur Gruppenseite →" link), never direct navigation |
| Tile privacy (GDPR) | Load OSM tiles directly; add a paragraph to `/datenschutz` (IP transmission to OSM Foundation, legitimate interest). No consent gate |
| Map library | Leaflet + OSM raster tiles — keyless/free, small bundle, matches the keyless Photon approach. (Rejected: MapLibre GL — needs MapTiler key + big bundle; custom SVG map — no zoom/pan, more design work) |

## 1. Data model (groups module)

New nullable columns on `groups` (migration `modules/groups/migrations/0004_location.sql`):

- `location_name text` — the picked place's display name (editor-facing only)
- `location_address text` — formatted address (editor-facing only, never public)
- `location_lat double precision`
- `location_lng double precision`

Integrity: either all four are set or all four are null (enforced in the service
layer; a CHECK constraint on lat/lng pairing is welcome but not required).
Validation: lat ∈ [-90, 90], lng ∈ [-180, 180].

Service changes in `modules/groups`:

- `upsert` / `manage` inputs accept an optional `location` object
  (`{ name, address, lat, lng }`) or `null` to clear it.
- `GroupRow` / public types expose the new fields.
- No new service is needed for the map; pages use `listGroups` and filter/project
  the fields they need. Public pages must project only `slug, name, city, lat, lng`
  to the client — `location_name`/`location_address` never leave the server on
  public routes.

## 2. Editing UI

- Move `LocationPicker` from `apps/web/app/admin/events/_editor/` to a shared
  component location under `apps/web/app` (pure relocation; the events editor
  imports the new path, behavior unchanged).
- Add the picker to:
  - `GroupProfileForm` (board area, group leads)
  - admin `GroupForm` (`/admin/gruppen/[slug]/bearbeiten` and `neu`)
- Both forms show the currently set place (name + address) and offer an
  "Ort entfernen" action that clears all four fields.
- The corresponding server actions validate the all-or-nothing rule and
  coordinate ranges, reusing existing authz (`requireGroupScope` /
  `canManageGroup`) untouched.

## 3. Map component

`GroupMap` — a client component, dynamically imported with `ssr: false`
(Leaflet is browser-only). New dependency: `leaflet` (+ `@types/leaflet`).
Record the library choice as an ADR in `docs/decisions/` (tech-stack addition).

- Props: `pins: { slug, name, city, lat, lng }[]` — nothing else crosses the
  server/client boundary.
- Tile layer: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with the
  mandatory "© OpenStreetMap contributors" attribution.
- Initial view: `fitBounds` over all pins with padding; single pin → fixed
  sensible zoom (~10); defensive fallback center = Germany.
- Markers: custom `divIcon` styled with design-system tokens; brand accent
  `#d12020` is correct here (pins are accent/active elements). No inline
  ad-hoc values — consume tokens.
- Popup: group name (strong), city (muted), "Zur Gruppenseite →" as a real
  `<a href="/gruppen/[slug]">`.
- `scrollWheelZoom: false` until the user clicks/focuses the map, so the
  homepage scroll is never hijacked; +/− controls and pinch-zoom always work.
- Container: fixed height (~420px desktop, less on mobile), design-system card
  radius/shadow, `overflow hidden`.

## 4. Placement & empty state

- **Start page:** `GruppenBlock` renders the map with an
  "Alle Hochschulgruppen ansehen →" link beneath it.
- **/gruppen:** map above the existing card grid; the grid stays (accessible
  path; also covers groups without coordinates).
- **Empty state:** if zero active groups have coordinates, both pages render
  exactly as today (card grid only, no map, no Leaflet JS loaded). The feature
  can ship before any locations exist and appears automatically once the first
  location is saved.

## 5. Feature flag

New flag `group_map` in `core/feature-flags`, gating only the **public map
rendering** on both pages. The editing fields ship ungated (they live behind
auth already), so locations can be entered in production while the map is
still hidden — flip the flag once the data is in and the block is visually
approved. Flag off ⇒ today's public behavior everywhere.

## 6. Datenschutz

Add a paragraph to `/datenschutz`: embedded OpenStreetMap map, tile requests
transmit the visitor's IP address to the OpenStreetMap Foundation (UK),
processed on the basis of legitimate interest (Art. 6 (1) f GDPR).

## 7. Error handling

- Photon search failures already degrade to an empty result list (existing
  behavior, kept).
- Tile-server failure: Leaflet shows gray tiles; pins and popups still work.
  No custom handling.
- Invalid/partial location payloads on the server actions → validation error
  rendered by the existing form error path.

## 8. Testing

- **Groups module (integration, Docker Postgres):** store location, clear
  location, reject partial location, reject out-of-range coordinates,
  migration applies.
- **E2E (Playwright):** with Photon stubbed via route interception —
  set a location through the admin group form; assert `/gruppen` renders the
  map with the pin and the popup links to the group page. Tile requests
  aborted/stubbed so the test is hermetic.
- **Unit:** LocationPicker keeps its existing tests (path move only);
  `GroupMap` pin/bounds helpers unit-tested where extractable.

## Out of scope

- Anything on the individual group page (`/gruppen/[slug]` content is a
  colleague's work; the data is available via `getGroupBySlug`).
- Multiple locations per group, marker clustering, geocoding beyond Photon,
  self-hosted tiles.
