import { describe, expect, it } from "vitest";

import { badgeLabel, badgeText } from "./badge-count";

describe("badgeText", () => {
  it("zeigt kleine Zahlen unverändert", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(99)).toBe("99");
  });

  it("deckelt ab 100 auf 99+", () => {
    expect(badgeText(100)).toBe("99+");
    expect(badgeText(4711)).toBe("99+");
  });
});

describe("badgeLabel", () => {
  it("nennt die echte Zahl, auch wenn die Anzeige gedeckelt ist", () => {
    expect(badgeLabel(3, "offene Freigaben")).toBe("3 offene Freigaben");
    expect(badgeLabel(150, "offene Freigaben")).toBe("150 offene Freigaben");
  });
});
