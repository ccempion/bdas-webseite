import { describe, expect, it } from "vitest";

import type { Scope } from "@bdas/dashboard-shell";

import { activeScope, isNavItemActive } from "./nav";

const FEDERAL: Scope = { kind: "federal" };
const AACHEN: Scope = { kind: "group", groupId: "grp_ac", slug: "aachen", name: "HG Aachen" };
const MG: Scope = {
  kind: "group",
  groupId: "grp_mg",
  slug: "moenchengladbach",
  name: "HG Mönchengladbach",
};

describe("activeScope", () => {
  const scopes = [FEDERAL, AACHEN, MG];

  it("selects the federal scope for federal paths", () => {
    expect(activeScope(scopes, "/federal/members")).toBe(FEDERAL);
    expect(activeScope(scopes, "/federal/roles")).toBe(FEDERAL);
  });

  it("selects the matching group for /gruppe/<slug> paths", () => {
    expect(activeScope(scopes, "/gruppe/aachen/events")).toBe(AACHEN);
    expect(activeScope(scopes, "/gruppe/moenchengladbach/files/f_1")).toBe(MG);
  });

  it("falls back to federal when the group slug is not granted", () => {
    expect(activeScope(scopes, "/gruppe/unknown/overview")).toBe(FEDERAL);
  });

  it("falls back to the first scope when there is no federal scope", () => {
    expect(activeScope([AACHEN, MG], "/federal/members")).toBe(AACHEN);
  });

  it("returns undefined when there are no scopes", () => {
    expect(activeScope([], "/federal/members")).toBeUndefined();
  });
});

describe("isNavItemActive", () => {
  it("matches the exact item path", () => {
    expect(isNavItemActive("/federal/roles", "/federal/roles")).toBe(true);
  });

  it("does not bleed across sibling items", () => {
    // The original soft-navigation bug: members stayed active on the roles page.
    expect(isNavItemActive("/federal/roles", "/federal/members")).toBe(false);
    expect(isNavItemActive("/federal/members", "/federal/roles")).toBe(false);
  });

  it("keeps the parent item active on nested routes", () => {
    expect(isNavItemActive("/federal/files/f_123", "/federal/files")).toBe(true);
  });

  it("does not treat a prefix-only string as nested", () => {
    expect(isNavItemActive("/federal/files-archive", "/federal/files")).toBe(false);
  });
});
