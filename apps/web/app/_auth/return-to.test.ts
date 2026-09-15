import { describe, expect, it } from "vitest";

import { buildAnmeldenUrl, sanitizeReturnTo } from "./return-to";

describe("sanitizeReturnTo", () => {
  it("accepts a plain internal path", () => {
    expect(sanitizeReturnTo("/account")).toBe("/account");
  });

  it("accepts a nested path with a dynamic segment", () => {
    expect(sanitizeReturnTo("/admin/events/123/edit")).toBe("/admin/events/123/edit");
  });

  it("accepts a path carrying its own query string", () => {
    expect(sanitizeReturnTo("/gruppe/muenchen/overview?tab=mitglieder")).toBe(
      "/gruppe/muenchen/overview?tab=mitglieder",
    );
  });

  it("accepts the root path", () => {
    expect(sanitizeReturnTo("/")).toBe("/");
  });

  it("rejects a missing value", () => {
    expect(sanitizeReturnTo(undefined)).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(sanitizeReturnTo("")).toBeNull();
  });

  it("rejects an array value (repeated query param)", () => {
    expect(sanitizeReturnTo(["/account", "/admin"])).toBeNull();
  });

  it("rejects a value with no leading slash", () => {
    expect(sanitizeReturnTo("account")).toBeNull();
  });

  it("rejects a protocol-relative URL", () => {
    expect(sanitizeReturnTo("//evil.example")).toBeNull();
  });

  it("rejects a scheme-qualified URL", () => {
    expect(sanitizeReturnTo("https://evil.example")).toBeNull();
    expect(sanitizeReturnTo("https://evil.example/account")).toBeNull();
  });

  it("rejects a javascript: pseudo-scheme", () => {
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
  });

  it("rejects a backslash-obfuscated protocol-relative URL", () => {
    expect(sanitizeReturnTo("/\\evil.example")).toBeNull();
  });

  it("rejects a value carrying a header-injection attempt", () => {
    expect(sanitizeReturnTo("/foo\r\nSet-Cookie: x=1")).toBeNull();
  });
});

describe("buildAnmeldenUrl", () => {
  it("encodes the path into a returnTo query parameter", () => {
    expect(buildAnmeldenUrl("/admin/events")).toBe("/anmelden?returnTo=%2Fadmin%2Fevents");
  });

  it("encodes special characters in the path", () => {
    expect(buildAnmeldenUrl("/gruppe/münchen/overview")).toBe(
      "/anmelden?returnTo=%2Fgruppe%2Fm%C3%BCnchen%2Foverview",
    );
  });
});
