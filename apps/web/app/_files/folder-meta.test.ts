import { describe, expect, it } from "vitest";

import type { Folder } from "@bdas/files";

import {
  formatFileSize,
  formatFolderCounts,
  mimeCategory,
  mimeIcon,
  subfolderCounts,
} from "./folder-meta";

function folder(id: string, parentId: string | null): Folder {
  return {
    id,
    slug: id,
    name: id,
    scope: "members_all",
    groupId: null,
    parentId,
    depth: parentId === null ? 0 : 1,
    description: "",
    createdAt: new Date(),
    createdBy: null,
  };
}

describe("mimeCategory", () => {
  it("classifies each bucket", () => {
    expect(mimeCategory("application/pdf")).toBe("pdf");
    expect(mimeCategory("image/png")).toBe("image");
    expect(mimeCategory("image/webp")).toBe("image");
    expect(mimeCategory("text/csv")).toBe("spreadsheet");
    expect(mimeCategory("application/vnd.ms-excel")).toBe("spreadsheet");
    expect(mimeCategory("application/msword")).toBe("document");
    expect(mimeCategory("text/plain")).toBe("document");
    expect(
      mimeCategory("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ).toBe("document");
  });

  it("falls back to generic for archives and unknown types", () => {
    expect(mimeCategory("application/zip")).toBe("generic");
    expect(mimeCategory("application/octet-stream")).toBe("generic");
  });

  it("mimeIcon returns a non-empty glyph per category", () => {
    expect(mimeIcon("application/pdf")).not.toBe("");
    expect(mimeIcon("application/zip")).toBe(mimeIcon("application/octet-stream"));
  });
});

describe("formatFileSize", () => {
  it("formats bytes, KB, and MB at the boundaries", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(25 * 1024 * 1024)).toBe("25.0 MB");
  });
});

describe("subfolderCounts", () => {
  it("counts only direct children per parent", () => {
    const folders = [
      folder("root-a", null),
      folder("root-b", null),
      folder("child-1", "root-a"),
      folder("child-2", "root-a"),
      folder("grandchild", "child-1"),
    ];
    const counts = subfolderCounts(folders);
    expect(counts["root-a"]).toBe(2);
    expect(counts["child-1"]).toBe(1);
    expect(counts["root-b"]).toBeUndefined();
    expect(counts["child-2"]).toBeUndefined();
  });

  it("returns an empty map for a folder list with no children", () => {
    const folders = [folder("root-a", null)];
    expect(subfolderCounts(folders)).toEqual({});
  });
});

describe("formatFolderCounts", () => {
  it("shows both counts separated by a middle dot", () => {
    expect(formatFolderCounts(2, 3)).toBe("2 Dateien · 3 Ordner");
  });

  it("uses singular for exactly one file or one folder", () => {
    expect(formatFolderCounts(1, 1)).toBe("1 Datei · 1 Ordner");
  });

  it("omits the folder segment when there are no subfolders", () => {
    expect(formatFolderCounts(2, 0)).toBe("2 Dateien");
  });

  it("omits the file segment when there are no files", () => {
    expect(formatFolderCounts(0, 3)).toBe("3 Ordner");
  });

  it("shows Leer when both counts are zero", () => {
    expect(formatFolderCounts(0, 0)).toBe("Leer");
  });
});
