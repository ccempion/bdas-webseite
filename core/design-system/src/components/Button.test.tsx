// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { tailwindPreset } from "../tailwind-preset";
import { colors, keyframes } from "../tokens";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button on-brand variant", () => {
  it("is a white button with red label — legal only on a brand-red field", () => {
    render(<Button variant="on-brand">Ja, ich bin dabei</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("bg-bdas-surface");
    expect(cls).toContain("text-bdas-red");
  });

  it("keeps the existing variants untouched", () => {
    render(<Button>Primär</Button>);
    expect(screen.getByRole("button").className).toContain("bg-bdas-red");
  });
});

describe("H1 eye-catcher tokens", () => {
  it("declares the on-brand ink and exposes it as a utility", () => {
    expect(colors.ink.onBrand).toBe("#ffffff");
    const bdas = (
      tailwindPreset.theme?.extend?.["colors"] as Record<string, Record<string, string>>
    )["bdas"];
    expect(bdas?.["ink-on-brand"]).toBe(colors.ink.onBrand);
  });

  it("mirrors fadeSlideDown as fadeSlideUp and wires the animation", () => {
    expect(keyframes.fadeSlideUp.from.transform).toBe("translateY(5px)");
    const anim = tailwindPreset.theme?.extend?.["animation"] as Record<string, string>;
    expect(anim["bdas-fade-slide-up"]).toContain("bdas-fade-slide-up");
    expect(anim["bdas-fade-slide-up"]).toContain("400ms");
  });
});
