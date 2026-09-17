import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import { joinHref, requireOnboardingFlag } from "./flag";

afterEach(() => {
  delete process.env["BDAS_FLAG_ONBOARDING"];
});

describe("onboarding flag", () => {
  it("keeps the old registration link while the flag is off", () => {
    expect(joinHref()).toBe("/registrieren");
    expect(() => requireOnboardingFlag()).toThrow("NOT_FOUND");
  });

  it("points at the wizard once the flag is on", () => {
    process.env["BDAS_FLAG_ONBOARDING"] = "true";
    expect(joinHref()).toBe("/mitmachen");
    expect(() => requireOnboardingFlag()).not.toThrow();
  });
});
