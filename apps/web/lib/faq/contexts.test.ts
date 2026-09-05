import { describe, expect, it } from "vitest";
import { FAQ_CONTEXTS } from "./contexts";

describe("FAQ_CONTEXTS", () => {
  it("has unique, non-empty keys and labels", () => {
    expect(FAQ_CONTEXTS.length).toBeGreaterThan(0);
    const keys = FAQ_CONTEXTS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of FAQ_CONTEXTS) {
      expect(c.key.trim()).toBe(c.key);
      expect(c.key.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});
