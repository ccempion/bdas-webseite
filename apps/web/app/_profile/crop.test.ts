import { describe, expect, it } from "vitest";

import { clampOffset, minZoom, sourceRect } from "./crop";

const FRAME = 300;

describe("minZoom", () => {
  it("skaliert ein Querformat auf die Höhe", () => {
    expect(minZoom({ width: 1200, height: 600 }, FRAME)).toBeCloseTo(0.5);
  });

  it("skaliert ein Hochformat auf die Breite", () => {
    expect(minZoom({ width: 600, height: 1200 }, FRAME)).toBeCloseTo(0.5);
  });

  it("vergrößert ein zu kleines Bild, bis es den Rahmen füllt", () => {
    expect(minZoom({ width: 150, height: 150 }, FRAME)).toBeCloseTo(2);
  });
});

describe("clampOffset", () => {
  const natural = { width: 1200, height: 600 };

  it("lässt oben und links keinen leeren Rand zu", () => {
    const out = clampOffset({ zoom: 0.5, x: 50, y: 20 }, natural, FRAME);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it("lässt unten und rechts keinen leeren Rand zu", () => {
    const out = clampOffset({ zoom: 0.5, x: -9999, y: -9999 }, natural, FRAME);
    expect(out.x).toBe(-(1200 * 0.5 - FRAME));
    expect(out.y).toBe(-(600 * 0.5 - FRAME));
  });

  it("lässt einen gültigen Versatz unverändert", () => {
    const out = clampOffset({ zoom: 0.5, x: -100, y: 0 }, natural, FRAME);
    expect(out).toEqual({ zoom: 0.5, x: -100, y: 0 });
  });

  it("hebt einen Zoom unterhalb von minZoom auf minZoom an", () => {
    const out = clampOffset({ zoom: 0.1, x: 0, y: 0 }, natural, FRAME);
    expect(out.zoom).toBeCloseTo(0.5);
  });
});

describe("sourceRect", () => {
  it("liefert bei minZoom und zentriertem Versatz den mittigen Quadrat-Ausschnitt", () => {
    const natural = { width: 1200, height: 600 };
    const zoom = minZoom(natural, FRAME);
    const centered = clampOffset({ zoom, x: -(1200 * zoom - FRAME) / 2, y: 0 }, natural, FRAME);

    const rect = sourceRect(centered, natural, FRAME);

    expect(rect.sw).toBeCloseTo(600);
    expect(rect.sh).toBeCloseTo(600);
    expect(rect.sx).toBeCloseTo(300);
    expect(rect.sy).toBeCloseTo(0);
  });

  it("wandert mit dem Versatz nach rechts", () => {
    const natural = { width: 1200, height: 600 };
    const rect = sourceRect({ zoom: 0.5, x: -300, y: 0 }, natural, FRAME);
    expect(rect.sx).toBeCloseTo(600);
    expect(rect.sw).toBeCloseTo(600);
  });
});
