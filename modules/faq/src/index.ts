/**
 * @bdas/faq — public surface. Per CLAUDE.md §1 rule 8: nur hier
 * re-exportierte Symbole sind außerhalb sichtbar. Services sind
 * auth-agnostisch; die App-Schicht autorisiert (Spec §4).
 */

export {
  createTopic,
  deleteTopic,
  listTopics,
  renameTopic,
  reorderTopics,
} from "./services/topics";
export {
  createEntry,
  deleteEntry,
  listEntries,
  listEntriesByContext,
  publishEntry,
  reorderEntries,
  unpublishEntry,
  updateEntry,
} from "./services/entries";
export {
  createSubmission,
  discardSubmission,
  listSubmissions,
  openSubmissionCount,
} from "./services/submissions";
export { feedbackCounts, upsertFeedback } from "./services/feedback";
export { FAQ_SECTIONS, FAQ_SUBGROUPS } from "./types";
export type {
  FaqEntry,
  FaqEntryStatus,
  FaqSectionKey,
  FaqSubgroupKey,
  FaqSubmission,
  FaqSubmissionStatus,
  FaqTopic,
  TiptapDoc,
} from "./types";
export type { EntryInput } from "./services/entries";
export type { Db as FaqDb } from "./services/topics";
