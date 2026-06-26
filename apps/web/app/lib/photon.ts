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
  const res = await fetch(url, { signal: signal ?? null });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: Feature[] };
  return (data.features ?? []).map(mapPhotonFeature);
}
