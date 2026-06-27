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

  async function onChange(value: string) {
    setQ(value);
    setSelected(null);
    abort.current?.abort();
    abort.current = new AbortController();
    setResults(await searchPlaces(value, abort.current.signal).catch(() => []));
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
        onChange={(e) => onChange(e.target.value)}
      />
      {results.length > 0 && !selected ? (
        <ul className="mt-1 rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-dropdown">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-bdas-overlay-hover"
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
        <p className="mt-1 text-sm text-bdas-ink-muted">
          📍 {selected.name}
          {selected.address ? `, ${selected.address}` : ""}
        </p>
      ) : null}
      <input type="hidden" name="locationName" value={selected?.name ?? ""} />
      <input type="hidden" name="locationAddress" value={selected?.address ?? ""} />
      <input type="hidden" name="locationLat" value={selected?.lat ?? ""} />
      <input type="hidden" name="locationLng" value={selected?.lng ?? ""} />
    </Field>
  );
}
