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
