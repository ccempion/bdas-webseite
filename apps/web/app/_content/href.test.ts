import { describe, expect, it } from "vitest";

import { isExternalHref, safeHref } from "./href";

describe("safeHref", () => {
  it("accepts http, https, relative and anchor hrefs unchanged", () => {
    expect(safeHref("https://bdaj.de")).toBe("https://bdaj.de");
    expect(safeHref("http://example.org/x")).toBe("http://example.org/x");
    expect(safeHref("/impressum")).toBe("/impressum");
    expect(safeHref("#kontakt")).toBe("#kontakt");
    expect(safeHref("  https://bdaj.de  ")).toBe("https://bdaj.de");
  });

  it("rejects unsafe or malformed hrefs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("mailto:a@b.de")).toBeNull();
    expect(safeHref("//evil.com")).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref("   ")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });
});

describe("isExternalHref", () => {
  it("is true only for absolute http(s) URLs", () => {
    expect(isExternalHref("https://bdaj.de")).toBe(true);
    expect(isExternalHref("http://x.de")).toBe(true);
    expect(isExternalHref("/impressum")).toBe(false);
    expect(isExternalHref("#kontakt")).toBe(false);
  });
});
