import type { FaqSubmission } from "@bdas/faq";

import { FAQ_CONTEXTS } from "../../../../lib/faq/contexts";

export type SubmissionCardView = {
  id: string;
  question: string;
  details: string | null;
  contextLabel: string | null;
  submitterName: string;
  submittedAtIso: string;
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
  }));
}
