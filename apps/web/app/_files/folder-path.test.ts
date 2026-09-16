import { describe, expect, it } from "vitest";

import type { Folder } from "@bdas/files";

import { buildBreadcrumbs, entryFolders, folderPathOptions } from "./folder-path";

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

describe("entryFolders", () => {
  it("returns the roots when the whole tree is readable", () => {
    expect(entryFolders(TREE).map((x) => x.id)).toEqual(["root"]);
  });

  it("returns a granted subfolder whose parent is not readable (ADR 0047)", () => {
    const readable = TREE.filter((x) => x.id !== "root");
    expect(entryFolders(readable).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("folderPathOptions", () => {
  it("labels every folder with its full path, sorted by path", () => {
    const other = f("z", null, 0, "Alle Mitglieder");
    expect(folderPathOptions([...TREE, other])).toEqual([
      { id: "z", path: "Alle Mitglieder" },
      { id: "root", path: "Vorstand" },
      { id: "a", path: "Vorstand / Protokolle" },
      { id: "b", path: "Vorstand / Protokolle / 2026" },
    ]);
  });
});
