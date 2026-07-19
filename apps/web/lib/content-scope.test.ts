import { describe, expect, it } from "vitest";

import { groupPageSlug } from "./content-scope";

describe("groupPageSlug", () => {
  it("extracts the group slug from a group content slug", () => {
    expect(groupPageSlug("gruppen/aachen")).toBe("aachen");
    expect(groupPageSlug("gruppen/koeln-sued")).toBe("koeln-sued");
  });

  it("returns null for federal pages and nested paths", () => {
    expect(groupPageSlug("impressum")).toBeNull();
    expect(groupPageSlug("ueber-uns/bundessprecherinnenrat")).toBeNull();
    expect(groupPageSlug("gruppen/aachen/extra")).toBeNull();
    expect(groupPageSlug("gruppen/")).toBeNull();
    expect(groupPageSlug("")).toBeNull();
  });
});
