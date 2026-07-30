import { describe, expect, it } from "vitest";

import type { Folder } from "@bdas/files";

import { buildBreadcrumbs } from "./folder-path";

function f(id: string, parentId: string | null, depth: number, name = id): Folder {
  return {
    id,
    slug: id,
    name,
    scope: "local_board",
    groupId: "grp_a",
    parentId,
    depth,
    description: "",
    createdAt: new Date(),
    createdBy: null,
  };
}

const TREE: Folder[] = [
  f("root", null, 0, "Vorstand"),
  f("a", "root", 1, "Protokolle"),
  f("b", "a", 2, "2026"),
];

describe("buildBreadcrumbs", () => {
  it("returns the root-first path including the target", () => {
    expect(buildBreadcrumbs(TREE, "b").map((x) => x.name)).toEqual([
      "Vorstand",
      "Protokolle",
      "2026",
    ]);
  });

  it("returns just the folder for a root", () => {
    expect(buildBreadcrumbs(TREE, "root").map((x) => x.name)).toEqual(["Vorstand"]);
  });

  it("returns empty for an unknown id", () => {
    expect(buildBreadcrumbs(TREE, "nope")).toEqual([]);
  });

  it("stops instead of looping if a parent link is dangling", () => {
    const orphan: Folder[] = [f("x", "missing", 1)];
    expect(buildBreadcrumbs(orphan, "x").map((y) => y.id)).toEqual(["x"]);
  });
});
