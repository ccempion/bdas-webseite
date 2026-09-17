import { describe, expect, it } from "vitest";

import { onboardingLanding, type LandingInput } from "./landing";

const base: LandingInput = {
  memberStatus: "pending",
  journeyStatus: null,
  hasOpenApplication: false,
  profileComplete: false,
};

describe("onboardingLanding", () => {
  it.each<[string, Partial<LandingInput>, ReturnType<typeof onboardingLanding>]>([
    ["no member row", { memberStatus: null }, null],
    ["active member", { memberStatus: "active" }, null],
    ["open journey", { journeyStatus: "details_offen" }, "/mitmachen/angaben"],
    ["open journey wins over an old profile", { journeyStatus: "details_offen", profileComplete: true }, "/mitmachen/angaben"],
    ["submitted journey", { journeyStatus: "abgeschickt" }, null],
    ["old flow, application open", { hasOpenApplication: true }, null],
    ["old flow, profile done", { profileComplete: true }, null],
    ["account without anything", {}, "/mitmachen"],
  ])("%s", (_label, patch, expected) => {
    expect(onboardingLanding({ ...base, ...patch })).toBe(expected);
  });
});
