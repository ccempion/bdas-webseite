import { describe, expect, it } from "vitest";

import { cityMatches, groupInCity, searchPlaces } from "./place-search";

const GROUPS = [
  { id: "grp_ber", name: "BDAS Berlin", city: "Berlin" },
  { id: "grp_ffm", name: "BDAS Frankfurt", city: "Frankfurt" },
];
const UNIS = [
  ["TU Berlin", "Berlin"],
  ["Goethe-Universität", "Frankfurt am Main"],
  ["Universität Passau", "Passau"],
] as const;

describe("cityMatches", () => {
  it("matches the same city, case-insensitively, and longer official names", () => {
    expect(cityMatches("Berlin", "berlin")).toBe(true);
    expect(cityMatches("Frankfurt", "Frankfurt am Main")).toBe(true);
    expect(cityMatches("Frankfurt", "Frankfurter Umland")).toBe(false);
    expect(cityMatches("Berlin", "Passau")).toBe(false);
  });
});

describe("searchPlaces", () => {
  it("needs two characters", () => {
    expect(searchPlaces("b", GROUPS, UNIS)).toEqual([]);
  });

  it("finds groups by city and name", () => {
    expect(searchPlaces("berl", GROUPS, UNIS)[0]).toEqual({
      groupId: "grp_ber",
      label: "BDAS Berlin",
      detail: "Aktive Hochschulgruppe · Berlin",
    });
  });

  it("maps a university to the group of its city", () => {
    expect(searchPlaces("goethe", GROUPS, UNIS)).toEqual([
      { groupId: "grp_ffm", label: "Goethe-Universität", detail: "BDAS Frankfurt" },
    ]);
  });

  it("offers nothing for a university in a city without a group", () => {
    expect(searchPlaces("passau", GROUPS, UNIS)).toEqual([]);
  });

  it("caps the list", () => {
    expect(searchPlaces("bdas", GROUPS, UNIS, 1)).toHaveLength(1);
  });
});

describe("groupInCity", () => {
  it("returns the group of a typed city, or null", () => {
    expect(groupInCity(" berlin ", GROUPS)?.id).toBe("grp_ber");
    expect(groupInCity("Passau", GROUPS)).toBeNull();
  });
});
