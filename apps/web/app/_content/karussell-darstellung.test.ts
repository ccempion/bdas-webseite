import { describe, expect, it } from "vitest";

import {
  aktiveFolie,
  coverflowStil,
  effektiveDarstellung,
  istBeschriftung,
  relativeLage,
} from "./karussell-darstellung";

describe("aktiveFolie", () => {
  it("names the slide nearest the centre, counting in slide pitch", () => {
    expect(aktiveFolie(0, 400, 5)).toBe(0);
    expect(aktiveFolie(400, 400, 5)).toBe(1);
    expect(aktiveFolie(1600, 400, 5)).toBe(4);
  });

  it("rounds to the nearer slide while a scroll is still settling", () => {
    expect(aktiveFolie(180, 400, 5)).toBe(0);
    expect(aktiveFolie(220, 400, 5)).toBe(1);
  });

  it("clamps at both ends, so an overscroll bounce names no slide that is not there", () => {
    expect(aktiveFolie(-1000, 400, 5)).toBe(0);
    expect(aktiveFolie(99_999, 400, 5)).toBe(4);
  });

  it("answers zero before the rail has been laid out", () => {
    expect(aktiveFolie(0, 0, 3)).toBe(0);
    expect(aktiveFolie(250, 0, 3)).toBe(0);
  });

  it("answers zero for an empty rail rather than a negative index", () => {
    expect(aktiveFolie(0, 400, 0)).toBe(0);
  });

  it("counts in pitch, so the gap between slides no longer accumulates", () => {
    // 300px slide + 24px gap. The fourth slide sits at 3 * 324, not 3 * 300 —
    // the old rail-width arithmetic drifted a gap per slide and eventually
    // named the wrong one.
    expect(aktiveFolie(972, 324, 6)).toBe(3);
  });
});

describe("relativeLage", () => {
  it("is zero for the slide sitting in the centre", () => {
    expect(relativeLage(800, 400, 2)).toBe(0);
  });

  it("is positive to the right of centre and negative to the left", () => {
    expect(relativeLage(800, 400, 3)).toBe(1);
    expect(relativeLage(800, 400, 1)).toBe(-1);
  });

  it("is fractional mid-swipe, which is what lets the tilt follow the finger", () => {
    expect(relativeLage(600, 400, 2)).toBe(0.5);
  });

  it("answers zero before the rail has been laid out", () => {
    expect(relativeLage(0, 0, 3)).toBe(0);
  });
});

describe("coverflowStil", () => {
  it("leaves the centred slide upright, opaque and on top", () => {
    const stil = coverflowStil(0, false);
    expect(stil.opacity).toBe(1);
    expect(stil.transform).toContain("rotateY(0deg)");
    expect(stil.transform).toContain("scale(1)");
  });

  it("tilts the two neighbours towards the centre, in opposite directions", () => {
    const rechts = coverflowStil(1, false);
    const links = coverflowStil(-1, false);
    expect(rechts.transform).toContain("rotateY(-38deg)");
    expect(links.transform).toContain("rotateY(38deg)");
  });

  it("shrinks and fades a neighbour", () => {
    const stil = coverflowStil(1, false);
    expect(stil.transform).toContain("scale(0.82)");
    expect(stil.opacity).toBe(0.55);
  });

  it("stops getting more extreme past the clamp, so the deck reads as three", () => {
    expect(coverflowStil(2, false)).toEqual(coverflowStil(9, false));
  });

  it("interpolates, so a half-swiped slide is half-tilted", () => {
    const stil = coverflowStil(0.5, false);
    expect(stil.transform).toContain("rotateY(-19deg)");
  });

  it("keeps the centred slide above its neighbours", () => {
    const mitte = Number(coverflowStil(0, false).zIndex);
    const nachbar = Number(coverflowStil(1, false).zIndex);
    expect(mitte).toBeGreaterThan(nachbar);
  });

  it("drops tilt and scale under reduced motion, keeping only the fade", () => {
    const stil = coverflowStil(1, true);
    expect(stil.transform).toBeUndefined();
    expect(stil.opacity).toBe(0.55);
  });
});

describe("effektiveDarstellung", () => {
  it("honours the board's choice with enough slides", () => {
    expect(effektiveDarstellung("coverflow", 3, false)).toBe("coverflow");
  });

  it("falls back below three slides, where there is no middle to speak of", () => {
    expect(effektiveDarstellung("coverflow", 2, false)).toBe("klassisch");
  });

  it("falls back inside the editor, where transforms break drag and drop", () => {
    expect(effektiveDarstellung("coverflow", 6, true)).toBe("klassisch");
  });

  it("treats a document saved before the field existed as classic", () => {
    expect(effektiveDarstellung(undefined, 6, false)).toBe("klassisch");
  });
});

describe("istBeschriftung", () => {
  it("accepts the three known placements", () => {
    expect(istBeschriftung("unter")).toBe(true);
    expect(istBeschriftung("auf")).toBe(true);
    expect(istBeschriftung("keine")).toBe(true);
  });

  it("rejects anything else, so a stale document falls back rather than throws", () => {
    expect(istBeschriftung(undefined)).toBe(false);
    expect(istBeschriftung("daneben")).toBe(false);
  });
});
