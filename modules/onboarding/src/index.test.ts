import { describe, expect, it } from "vitest";

import * as onboarding from "./index";

describe("@bdas/onboarding public surface", () => {
  it("exports the flow, the pure functions and the services", () => {
    for (const name of [
      "FLOW",
      "QUESTION_TYP",
      "QUESTION_NAME",
      "QUESTION_STUDIENORT",
      "QUESTION_AKTIV_WO",
      "nextStep",
      "walk",
      "visibleOptions",
      "validateFlow",
      "sanitizeAnswers",
      "isValidAnswer",
      "placeOf",
      "fillText",
      "textContext",
      "parseEntryContext",
      "normalizeSource",
      "DEFAULT_GREETING",
      "DIRECT_SOURCE",
      "resolveTarget",
      "loadFlowEnv",
      "startJourney",
      "getJourneyForUser",
      "saveDetails",
      "completeJourney",
      "getApplicationIntents",
      "OUTCOME_IDS",
    ]) {
      expect(onboarding, name).toHaveProperty(name);
    }
  });

  it("keeps the table private", () => {
    expect(onboarding).not.toHaveProperty("onboardingJourneys");
    expect(onboarding).not.toHaveProperty("setupOnboardingDb");
  });
});
