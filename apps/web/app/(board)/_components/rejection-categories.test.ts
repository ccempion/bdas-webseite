import { describe, expect, it } from "vitest";

import { categoryLabel, REJECTION_CATEGORIES } from "./rejection-categories";

describe("rejection categories", () => {
  it("offers exactly the three agreed categories", () => {
    expect(REJECTION_CATEGORIES.map((c) => c.key)).toEqual([
      "no_contact",
      "not_a_student",
      "other",
    ]);
  });

  it("renders German labels", () => {
    expect(categoryLabel("no_contact")).toBe("Kein Kontakt zustande gekommen");
    expect(categoryLabel("not_a_student")).toBe("Kein Student mehr");
    expect(categoryLabel("other")).toBe("Sonstiges");
  });

  it("falls back for an unknown or missing key", () => {
    expect(categoryLabel(null)).toBe("Kein Grund angegeben");
    expect(categoryLabel("was_auch_immer")).toBe("Kein Grund angegeben");
  });
});
