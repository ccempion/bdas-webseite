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
