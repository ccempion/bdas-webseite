import { describe, expect, it } from "vitest";

import { aktiveFolie } from "./Karussell";

describe("aktiveFolie", () => {
  it("names the slide that fills the rail", () => {
    expect(aktiveFolie(0, 400, 5)).toBe(0);
    expect(aktiveFolie(400, 400, 5)).toBe(1);
    expect(aktiveFolie(1600, 400, 5)).toBe(4);
  });

  it("rounds to the nearer slide while a scroll is still settling", () => {
    expect(aktiveFolie(180, 400, 5)).toBe(0);
    expect(aktiveFolie(220, 400, 5)).toBe(1);
  });

  it("clamps at both ends, so an overscroll bounce names no slide that is not there", () => {
    expect(aktiveFolie(-120, 400, 5)).toBe(0);
    expect(aktiveFolie(99_999, 400, 5)).toBe(4);
  });

  it("answers zero before the rail has a width", () => {
    // First render, and every test environment without a layout engine:
    // clientWidth is 0 and the division would be Infinity or NaN.
    expect(aktiveFolie(0, 0, 3)).toBe(0);
    expect(aktiveFolie(250, 0, 3)).toBe(0);
  });

  it("answers zero for an empty rail rather than a negative index", () => {
    expect(aktiveFolie(0, 400, 0)).toBe(0);
  });
});
