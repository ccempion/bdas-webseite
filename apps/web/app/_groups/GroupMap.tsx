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

// Germany's extent (47.27–55.06 N, 5.87–15.04 E) with a small margin, so
// panning stops just outside the border instead of drifting into neighboring
// countries or the open sea.
const GERMANY_BOUNDS = L.latLngBounds([46.7, 4.9], [55.6, 15.7]);
const MAX_ZOOM = 16;

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

    // minZoom is derived from the container's actual size so "zoomed all the
    // way out" always means "all of Germany, filling the frame" — on the
    // small mobile height and the larger desktop height alike.
    const minZoom = Math.min(map.getBoundsZoom(GERMANY_BOUNDS), MAX_ZOOM);
    map.setMinZoom(minZoom);
    map.setMaxZoom(MAX_ZOOM);
    map.setMaxBounds(GERMANY_BOUNDS);
    map.fitBounds(GERMANY_BOUNDS);

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
