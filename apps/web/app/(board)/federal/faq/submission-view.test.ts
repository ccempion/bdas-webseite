import { describe, expect, it } from "vitest";

import type { FaqSubmission } from "@bdas/faq";

import { toSubmissionCards } from "./submission-view";

function submission(over: Partial<FaqSubmission> = {}): FaqSubmission {
  return {
    id: "s1",
    question: "Wie lege ich ein Event an?",
    details: null,
    context: null,
    submittedBy: "u1",
    status: "open",
    entryId: null,
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    ...over,
  };
}

describe("toSubmissionCards", () => {
  it("resolves the submitter's name", () => {
    const [card] = toSubmissionCards({
      submissions: [submission()],
      namesByUserId: new Map([["u1", "Ayşe Yılmaz"]]),
    });
    expect(card!.submitterName).toBe("Ayşe Yılmaz");
    expect(card!.submittedAtIso).toBe("2026-09-01T10:00:00.000Z");
  });

  it("falls back when the submitter has no member row", () => {
    const [card] = toSubmissionCards({
      submissions: [submission()],
      namesByUserId: new Map(),
    });
    expect(card!.submitterName).toBe("Unbekanntes Mitglied");
  });

  it("labels a known context key and passes an unknown one through", () => {
    const [known, unknown] = toSubmissionCards({
      submissions: [
        submission({ id: "s1", context: "dateien" }),
        submission({ id: "s2", context: "veraltet.schluessel" }),
      ],
      namesByUserId: new Map(),
    });
    expect(known!.contextLabel).toBe("Dateien");
    expect(unknown!.contextLabel).toBe("veraltet.schluessel");
  });

  it("leaves contextLabel null when the submission has no context", () => {
    const [card] = toSubmissionCards({ submissions: [submission()], namesByUserId: new Map() });
    expect(card!.contextLabel).toBeNull();
  });

  it("flags hasDraft when a draft entry is already linked", () => {
    const [card] = toSubmissionCards({
      submissions: [submission({ entryId: "e1" })],
      namesByUserId: new Map(),
    });
    expect(card!.hasDraft).toBe(true);
  });

  it("leaves hasDraft false when no entry is linked yet", () => {
    const [card] = toSubmissionCards({
      submissions: [submission({ entryId: null })],
      namesByUserId: new Map(),
    });
    expect(card!.hasDraft).toBe(false);
  });
});
