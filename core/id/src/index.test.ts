import { describe, expect, it } from "vitest";
import { createId, hasPrefix } from "./index.js";

describe("createId", () => {
  it("produces an id with the requested prefix", () => {
    const id = createId("mem");
    expect(id.startsWith("mem_")).toBe(true);
    expect(id.length).toBe("mem_".length + 21);
  });

  it("rejects invalid prefixes", () => {
    expect(() => createId("X")).toThrow(/Invalid id prefix/);
    expect(() => createId("toolong")).toThrow();
    expect(() => createId("ab1")).toThrow();
  });

  it("produces distinct ids each call", () => {
    const a = createId("grp");
    const b = createId("grp");
    expect(a).not.toBe(b);
  });
});

describe("hasPrefix", () => {
  it("matches a prefix", () => {
    expect(hasPrefix("mem_abc123", "mem")).toBe(true);
    expect(hasPrefix("grp_abc123", "mem")).toBe(false);
  });
});
