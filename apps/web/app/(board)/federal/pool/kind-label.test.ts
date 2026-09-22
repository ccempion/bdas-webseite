import { describe, expect, it } from "vitest";

import { poolKindLabel } from "./kind-label";

describe("poolKindLabel", () => {
  it("keeps the old labels without a journey", () => {
    expect(poolKindLabel({ status: "active", intent: null })).toBe("Mitglied ohne Gruppe");
    expect(poolKindLabel({ status: "pending", intent: null })).toBe("Bewerber:in");
  });

  it("benennt die Ausgänge ohne Gruppe", () => {
    expect(
      poolKindLabel({
        status: "pending",
        intent: { outcome: "student_gruendung", status: "abgeschickt" },
      }),
    ).toBe("Möchte eine Gruppe gründen");
    expect(
      poolKindLabel({
        status: "pending",
        intent: { outcome: "student_ohne_gruppe", status: "abgeschickt" },
      }),
    ).toBe("Bewirbt sich ohne Gruppe");
    expect(
      poolKindLabel({ status: "pending", intent: { outcome: "alumnus", status: "abgeschickt" } }),
    ).toBe("Bewirbt sich als Alumna oder Alumnus");
  });

  it("marks a journey whose details are still open", () => {
    expect(
      poolKindLabel({ status: "pending", intent: { outcome: "student", status: "details_offen" } }),
    ).toBe("Angaben offen");
  });

  it("falls back for other submitted journeys", () => {
    expect(
      poolKindLabel({ status: "pending", intent: { outcome: "foerderer", status: "abgeschickt" } }),
    ).toBe("Bewerber:in");
  });
});
