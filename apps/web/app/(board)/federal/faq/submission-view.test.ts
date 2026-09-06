import { describe, expect, it } from "vitest";

import type { FaqEntry, FaqSubmission } from "@bdas/faq";

import { resumableDraft, toSubmissionCards, type SubmissionCardView } from "./submission-view";

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

  it("carries the linked draft's entry id", () => {
    const [card] = toSubmissionCards({
      submissions: [submission({ entryId: "e1" })],
      namesByUserId: new Map(),
    });
    expect(card!.draftEntryId).toBe("e1");
  });

  it("leaves draftEntryId null when no entry is linked yet", () => {
    const [card] = toSubmissionCards({
      submissions: [submission({ entryId: null })],
      namesByUserId: new Map(),
    });
    expect(card!.draftEntryId).toBeNull();
  });
});

function entry(over: Partial<FaqEntry> = {}): FaqEntry {
  return {
    id: "e1",
    section: "mitglieder",
    subgroup: null,
    topicId: null,
    question: "Bereits begonnene Antwort",
    body: { type: "doc", content: [] },
    youtubeId: null,
    relatedIds: [],
    contexts: [],
    status: "draft",
    position: 0,
    updatedAt: new Date("2026-09-02T10:00:00.000Z"),
    updatedBy: null,
    ...over,
  };
}

function card(over: Partial<SubmissionCardView> = {}): SubmissionCardView {
  return {
    id: "s1",
    question: "Wie lege ich ein Event an?",
    details: null,
    contextLabel: null,
    submitterName: "Ayşe Yılmaz",
    submittedAtIso: "2026-09-01T10:00:00.000Z",
    draftEntryId: null,
    ...over,
  };
}

describe("resumableDraft", () => {
  it("finds the linked draft so answering resumes it instead of forking a second one", () => {
    const draft = entry({ id: "e1" });
    expect(resumableDraft(card({ draftEntryId: "e1" }), [entry({ id: "e9" }), draft])).toBe(draft);
  });

  it("returns null when the submission has no draft yet", () => {
    expect(resumableDraft(card({ draftEntryId: null }), [entry({ id: "e1" })])).toBeNull();
  });

  it("returns null when the linked draft is gone, so the board can start a fresh one", () => {
    // `faq_submissions.entry_id` is ON DELETE SET NULL, so this only happens
    // when the entry is deleted between the page render and the click.
    expect(resumableDraft(card({ draftEntryId: "e1" }), [entry({ id: "e9" })])).toBeNull();
  });
});
