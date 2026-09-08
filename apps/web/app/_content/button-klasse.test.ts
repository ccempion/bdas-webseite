import { describe, expect, it } from "vitest";

import { buttonKlasse } from "./button-klasse";

describe("buttonKlasse", () => {
  it("keeps the primary button on the brand-red surface", () => {
    const cls = buttonKlasse("primaer");
    expect(cls).toContain("bg-bdas-red");
    expect(cls).toContain("rounded-bdas-sm");
  });

  it("keeps the secondary button as a hairline outline", () => {
    const cls = buttonKlasse("sekundaer");
    expect(cls).toContain("border-bdas-strong");
    expect(cls).not.toContain("bg-bdas-red");
  });

  it("hell is a light surface with ink text, for dark hero grounds", () => {
    const cls = buttonKlasse("hell");
    expect(cls).toContain("bg-bdas-surface");
    expect(cls).toContain("text-bdas-ink");
    expect(cls).not.toContain("bg-bdas-red");
  });

  it("falls back to primaer for a missing or unknown variant", () => {
    expect(buttonKlasse(undefined)).toBe(buttonKlasse("primaer"));
    expect(buttonKlasse("gross" as never)).toBe(buttonKlasse("primaer"));
  });
});
