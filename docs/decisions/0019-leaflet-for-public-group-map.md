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
