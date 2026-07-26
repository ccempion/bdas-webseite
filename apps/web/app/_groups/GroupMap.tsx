"use client";

import "leaflet/dist/leaflet.css";

import { colors } from "@bdas/design-system/tokens";
import L from "leaflet";
import { useEffect, useRef } from "react";

import germanyGeoJson from "./germany.geo.json";
import type { GroupPin } from "./pins";

/** Escape group-controlled strings before they enter Leaflet popup HTML. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Tailwind scans string literals, so these token classes are generated even
// though they only appear inside Leaflet's html option.
const PIN_HTML =
  '<span class="block h-5 w-5 rounded-full border-2 border-bdas-surface bg-bdas-red shadow-bdas-card"></span>';

const MAX_ZOOM = 16;

// Source: isellsoap/deutschlandGeoJSON (Unlicense / public domain),
// 1_deutschland/4_niedrig.geo.json — one MultiPolygon feature covering
// Germany's mainland plus its islands.
const GERMANY_GEOMETRY = (
  germanyGeoJson as unknown as GeoJSON.FeatureCollection<GeoJSON.MultiPolygon>
).features[0]!.geometry;

// A rectangle spanning the whole world with a hole punched out for each
// Germany landmass dims everything outside the country when filled. Built
// directly as Leaflet [lat, lng] rings (GeoJSON stores [lng, lat]) so no
// separate conversion layer is needed.
const WORLD_RING: L.LatLngTuple[] = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
];
const GERMANY_HOLES: L.LatLngTuple[][] = GERMANY_GEOMETRY.coordinates.map((polygon) =>
  polygon[0]!.map(([lng, lat]) => [lat, lng] as L.LatLngTuple),
);

export default function GroupMap({ pins }: { pins: GroupPin[] }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current || pins.length === 0) return;

    // scrollWheelZoom stays off until the visitor clicks the map, so the
    // landing page never traps page scrolling; +/- buttons and pinch work.
    const map = L.map(el.current, { scrollWheelZoom: false, maxBoundsViscosity: 1.0 });
    map.once("click", () => map.scrollWheelZoom.enable());

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Dim everything outside Germany, then trace the border on top. Both are
    // non-interactive so they never intercept drags/clicks, and both render
    // in Leaflet's overlayPane — below the markerPane markers use, so pins
    // stay clickable without any change to the marker/popup code below.
    L.polygon([WORLD_RING, ...GERMANY_HOLES], {
      interactive: false,
      stroke: false,
      fillColor: colors.surface.overlay.scrim,
      fillOpacity: 1,
    }).addTo(map);

    const border = L.geoJSON(germanyGeoJson as GeoJSON.GeoJsonObject, {
      interactive: false,
      style: { color: colors.brand.red, weight: 1.5, opacity: 0.6, fill: false },
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

    // Bounds come from the actual border geometry (plus a small pad) rather
    // than a hand-picked box, so they hug the silhouette. minZoom is derived
    // from the container's actual size so "zoomed all the way out" always
    // means "all of Germany, filling the frame" — on the small mobile height
    // and the larger desktop height alike.
    const germanyBounds = border.getBounds().pad(0.06);
    const minZoom = Math.min(map.getBoundsZoom(germanyBounds), MAX_ZOOM);
    map.setMinZoom(minZoom);
    map.setMaxZoom(MAX_ZOOM);
    map.setMaxBounds(germanyBounds);
    map.fitBounds(germanyBounds);

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
      // isolate contains Leaflet's internal panes/controls (z-index up to
      // 1000) inside this element's own stacking context, so they can never
      // paint above page chrome like the sticky header, regardless of the
      // exact z-index Leaflet assigns them internally.
      className="isolate h-72 w-full overflow-hidden rounded-bdas border border-bdas-soft shadow-bdas-card sm:h-[420px]"
    />
  );
}
