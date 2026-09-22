import { describe, expect, it } from "vitest";

import { FLOW } from "@bdas/onboarding";

import { waitingSentence } from "./sentence";

describe("waitingSentence", () => {
  it("nennt die Dauer, ohne den Entscheider in den Satz zu setzen", () => {
    expect(waitingSentence(FLOW.outcomes.bdaj)).toBe(
      "Wir melden uns per Mail, sobald die Entscheidung da ist, meist innerhalb von zwei Tagen.",
    );
  });

  it("kommt ohne lange Gedankenstriche aus", () => {
    for (const outcome of Object.values(FLOW.outcomes)) {
      expect(waitingSentence(outcome)).not.toContain("—");
    }
  });
});
