import { describe, expect, it } from "vitest";

import { ACCEPT_ATTR, ACCEPTED_IMAGE_TYPES, acceptImageFile } from "./photo-upload";

describe("acceptImageFile", () => {
  it.each(ACCEPTED_IMAGE_TYPES)("accepts %s", (type) => {
    expect(acceptImageFile({ type })).toBeNull();
  });

  it.each(["application/pdf", "image/gif", "text/plain", ""])("rejects %s", (type) => {
    expect(acceptImageFile({ type })).toBe("Nur JPEG, PNG, WebP oder AVIF.");
  });
});

describe("ACCEPT_ATTR", () => {
  it("lists every accepted type for the file dialog", () => {
    expect(ACCEPT_ATTR).toBe("image/jpeg,image/png,image/webp,image/avif");
  });
});
