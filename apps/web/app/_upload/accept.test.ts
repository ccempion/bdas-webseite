import { describe, expect, it } from "vitest";

import {
  CONTENT_IMAGE,
  PROFILE_IMAGE,
  dragHasFiles,
  intakeFiles,
  rejectReason,
  tooLargeMessage,
} from "./accept";

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "foto.png",
  type: "image/png",
  size: 1024,
  ...over,
});

describe("dragHasFiles", () => {
  it("is true when the drag advertises the Files kind", () => {
    expect(dragHasFiles(["Files"])).toBe(true);
  });

  it("is false for a text or link drag", () => {
    expect(dragHasFiles(["text/plain"])).toBe(false);
    expect(dragHasFiles([])).toBe(false);
  });
});

describe("rejectReason", () => {
  it("accepts the four allowed image types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
      expect(rejectReason(file({ type }), CONTENT_IMAGE)).toBeNull();
    }
  });

  it("names the file when the type is not allowed", () => {
    expect(rejectReason(file({ name: "clip.gif", type: "image/gif" }), CONTENT_IMAGE)).toBe(
      "clip.gif: nur JPEG, PNG, WebP oder AVIF.",
    );
  });

  it("rejects a dropped folder, which arrives as an empty typeless entry", () => {
    expect(rejectReason(file({ name: "Bilder", type: "", size: 0 }), CONTENT_IMAGE)).toBe(
      "Bilder: nur JPEG, PNG, WebP oder AVIF.",
    );
  });

  it("reports the surface's own cap", () => {
    expect(rejectReason(file({ size: 8 * 1024 * 1024 }), PROFILE_IMAGE)).toBe(
      "foto.png: größer als 5 MB.",
    );
    expect(rejectReason(file({ size: 8 * 1024 * 1024 }), CONTENT_IMAGE)).toBeNull();
  });

  it("accepts any listed type for a non-image spec", () => {
    const docs = { mime: ["application/pdf"], maxBytes: 1000, maxLabel: "1 KB" };
    expect(rejectReason(file({ name: "s.pdf", type: "application/pdf", size: 500 }), docs)).toBeNull();
    expect(rejectReason(file({ type: "image/png" }), docs)).toBe("foto.png: Dateityp nicht erlaubt.");
  });
});

describe("tooLargeMessage", () => {
  it("matches the wording the API routes return", () => {
    expect(tooLargeMessage(PROFILE_IMAGE)).toBe("Datei zu groß (max. 5 MB).");
    expect(tooLargeMessage(CONTENT_IMAGE)).toBe("Datei zu groß (max. 10 MB).");
  });
});

describe("intakeFiles", () => {
  it("splits accepted files from German rejection messages", () => {
    const out = intakeFiles(
      [file({ name: "a.png" }), file({ name: "b.gif", type: "image/gif" })],
      CONTENT_IMAGE,
    );
    expect(out.accepted.map((f) => f.name)).toEqual(["a.png"]);
    expect(out.rejected).toEqual(["b.gif: nur JPEG, PNG, WebP oder AVIF."]);
  });

  it("takes only the first acceptable file when the surface holds one image", () => {
    const out = intakeFiles([file({ name: "a.png" }), file({ name: "b.png" })], CONTENT_IMAGE, {
      firstOnly: true,
    });
    expect(out.accepted.map((f) => f.name)).toEqual(["a.png"]);
    expect(out.rejected).toEqual([]);
  });

  it("skips past a rejected first file to the next acceptable one", () => {
    const out = intakeFiles(
      [file({ name: "a.gif", type: "image/gif" }), file({ name: "b.png" })],
      CONTENT_IMAGE,
      { firstOnly: true },
    );
    expect(out.accepted.map((f) => f.name)).toEqual(["b.png"]);
    expect(out.rejected).toEqual(["a.gif: nur JPEG, PNG, WebP oder AVIF."]);
  });

  it("returns nothing for an empty drop", () => {
    expect(intakeFiles([], CONTENT_IMAGE)).toEqual({ accepted: [], rejected: [] });
  });
});
