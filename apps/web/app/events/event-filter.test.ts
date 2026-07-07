import { describe, expect, it } from "vitest";

import {
  buildHref,
  deriveOwners,
  FEDERATION_KEY,
  filterByGroups,
  parseSelected,
  toggleHref,
  type GroupInfo,
} from "./event-filter";

const groupById = new Map<string, GroupInfo>([
  ["g_koeln", { name: "Köln", slug: "koeln" }],
  ["g_berlin", { name: "Berlin", slug: "berlin" }],
]);

const ev = (groupId: string | null) => ({ groupId });

describe("deriveOwners", () => {
  it("returns only present groups, sorted by name, Bundesweit last", () => {
    const owners = deriveOwners(
      [ev("g_koeln"), ev(null), ev("g_berlin"), ev("g_koeln")],
      groupById,
    );
    expect(owners).toEqual([
      { key: "berlin", label: "Berlin" },
      { key: "koeln", label: "Köln" },
      { key: FEDERATION_KEY, label: "Bundesweit" },
    ]);
  });

  it("omits Bundesweit when no federation-wide event is present", () => {
    const owners = deriveOwners([ev("g_koeln")], groupById);
    expect(owners).toEqual([{ key: "koeln", label: "Köln" }]);
  });
});

describe("parseSelected", () => {
  it("keeps only valid keys", () => {
    const valid = new Set(["koeln", "berlin", FEDERATION_KEY]);
    expect([...parseSelected("koeln,unknown,bundesweit", valid)]).toEqual([
      "koeln",
      "bundesweit",
    ]);
    expect(parseSelected(undefined, valid).size).toBe(0);
  });
});

describe("filterByGroups", () => {
  const events = [ev("g_koeln"), ev("g_berlin"), ev(null)] as never[];
  it("returns all when selection is empty", () => {
    expect(filterByGroups(events, new Set(), groupById)).toHaveLength(3);
  });
  it("filters to selected group slugs", () => {
    expect(filterByGroups(events, new Set(["koeln"]), groupById)).toEqual([ev("g_koeln")]);
  });
  it("matches federation-wide events via the federation key", () => {
    expect(filterByGroups(events, new Set([FEDERATION_KEY]), groupById)).toEqual([ev(null)]);
  });
});

describe("buildHref / toggleHref", () => {
  it("builds a bare /events with no selection and no past", () => {
    expect(buildHref(new Set(), false)).toBe("/events");
  });
  it("encodes selection and past flag", () => {
    expect(buildHref(new Set(["koeln", "berlin"]), true)).toBe(
      "/events?groups=koeln%2Cberlin&past=1",
    );
  });
  it("toggles a key while preserving past", () => {
    expect(toggleHref("koeln", new Set(["koeln"]), true)).toBe("/events?past=1");
    expect(toggleHref("berlin", new Set(["koeln"]), false)).toBe(
      "/events?groups=koeln%2Cberlin",
    );
  });
});
