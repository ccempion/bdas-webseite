import { describe, expect, it } from "vitest";

import { formatFileSize, mimeCategory, mimeIcon } from "./folder-meta";

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
