import { describe, expect, it } from "vitest";

import { ausrichtungFlex, ausrichtungText } from "./ausrichtung";

describe("ausrichtung", () => {
  it("maps each value to its text class", () => {
    expect(ausrichtungText("links")).toBe("text-left");
    expect(ausrichtungText("mittig")).toBe("text-center");
    expect(ausrichtungText("rechts")).toBe("text-right");
  });

  it("maps each value to its flex-justify class", () => {
    expect(ausrichtungFlex("links")).toBe("justify-start");
    expect(ausrichtungFlex("mittig")).toBe("justify-center");
    expect(ausrichtungFlex("rechts")).toBe("justify-end");
  });

  it("falls back to left for a missing or unknown value", () => {
    expect(ausrichtungText(undefined)).toBe("text-left");
    expect(ausrichtungFlex(undefined)).toBe("justify-start");
    expect(ausrichtungText("mitte" as never)).toBe("text-left");
    expect(ausrichtungFlex("mitte" as never)).toBe("justify-start");
  });
});
