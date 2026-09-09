import { describe, expect, it } from "vitest";

import { buttonKlasse } from "./button-klasse";

describe("buttonKlasse", () => {
  // The lookup's only logic. Asserting that each variant's literal string
  // contains its own literal classes would restate the constant, not test it —
  // the rendered classes are covered where they matter, in the Button block's
  // and the Hero's own markup assertions.
  it("falls back to primaer for a missing or unknown variant", () => {
    expect(buttonKlasse(undefined)).toBe(buttonKlasse("primaer"));
    expect(buttonKlasse("gross" as never)).toBe(buttonKlasse("primaer"));
  });
});
