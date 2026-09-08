import { describe, expect, it } from "vitest";

import * as api from "./index";

/** Rule 8 as a test: the surface changes only on purpose. */
describe("newsletter public surface", () => {
  it("exports exactly the documented runtime surface", () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        "CONFIRM_PATH",
        "MAX_DISMISSALS",
        "NEWSLETTER_SOURCES",
        "PROMPT_INTERVAL_MS",
        "UNSUBSCRIBE_PATH",
        "confirmSubscription",
        "countSubscribers",
        "declineForUser",
        "getSubscriptionForUser",
        "listSubscribers",
        "peekUnsubscribeToken",
        "registerNewsletterSubscribers",
        "setAccountEmailResolver",
        "shouldPrompt",
        "subscribeAsUser",
        "subscribeAtRegistration",
        "subscribePublicly",
        "unsubscribeAsUser",
        "unsubscribeByToken",
      ].sort(),
    );
  });

  it("keeps the private internals private", () => {
    const keys = Object.keys(api);
    for (const leaked of [
      "newsletterSubscribers",
      "hashToken",
      "newToken",
      "recordConsent",
      "getAccountEmailResolver",
    ]) {
      expect(keys).not.toContain(leaked);
    }
  });
});
