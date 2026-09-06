import type { FaqEntry, FaqSubmission } from "@bdas/faq";

import { FAQ_CONTEXTS } from "../../../../lib/faq/contexts";

export type SubmissionCardView = {
  id: string;
  question: string;
  details: string | null;
  contextLabel: string | null;
  submitterName: string;
  submittedAtIso: string;
  /**
   * The draft entry already linked to this submission (`entry_id`), or null
   * while nobody has started answering. The board resolves it against the
   * entries it already renders so „Antwort verfassen" resumes that draft
   * instead of creating a second, orphaned one.
   */
  draftEntryId: string | null;
};

/**
 * A context key that is no longer in the registry still renders — as its raw
 * key. The module stores strings and the registry is code (Spec §3), so a key
 * can outlive an entry in FAQ_CONTEXTS; swallowing it would hide where the
 * question came from.
 */
function labelFor(context: string | null): string | null {
  if (context === null) return null;
  return FAQ_CONTEXTS.find((c) => c.key === context)?.label ?? context;
}

export function toSubmissionCards(input: {
  submissions: readonly FaqSubmission[];
  namesByUserId: ReadonlyMap<string, string>;
}): SubmissionCardView[] {
  return input.submissions.map((s) => ({
    id: s.id,
    question: s.question,
    details: s.details,
    contextLabel: labelFor(s.context),
    submitterName: input.namesByUserId.get(s.submittedBy) ?? "Unbekanntes Mitglied",
    submittedAtIso: s.createdAt.toISOString(),
    draftEntryId: s.entryId,
  }));
}

/**
 * The draft to reopen when the board acts on a submission, or null when it
 * should start a fresh one. A linked id that matches no rendered entry means
 * the draft was deleted since the page rendered (`entry_id` is ON DELETE SET
 * NULL) — starting over beats opening an empty dialog.
 */
export function resumableDraft(
  card: SubmissionCardView,
  entries: readonly FaqEntry[],
): FaqEntry | null {
  if (card.draftEntryId === null) return null;
  return entries.find((e) => e.id === card.draftEntryId) ?? null;
}
