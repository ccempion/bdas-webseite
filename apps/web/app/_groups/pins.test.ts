import { describe, expect, it } from "vitest";

import type { GroupSummary } from "@bdas/groups";

import { toPins } from "./pins";

const base = { id: "grp_1", status: "active" as const };

describe("toPins", () => {
  it("keeps only located groups and exposes exactly the public fields", () => {
    const groups: GroupSummary[] = [
      {
        ...base,
        slug: "koeln",
        name: "BDAS Köln",
        city: "Köln",
        location: { name: "Uni Köln", address: "Albertus-Magnus-Platz", lat: 50.9271, lng: 6.9285 },
      },
      { ...base, id: "grp_2", slug: "essen", name: "BDAS Essen", city: "Essen", location: null },
    ];

    const pins = toPins(groups);

    expect(pins).toHaveLength(1);
    expect(pins[0]).toEqual({
      slug: "koeln",
      name: "BDAS Köln",
      city: "Köln",
      lat: 50.9271,
      lng: 6.9285,
    });
    // Privacy: the location name/address must never reach the client payload.
    expect(Object.keys(pins[0]!).sort()).toEqual(["city", "lat", "lng", "name", "slug"]);
  });
});
