import { z } from "zod";

import { createId } from "@bdas/id";

export const FAQ_SECTIONS = ["allgemein", "bundesvorstand", "vorstand", "mitglieder"] as const;
export type FaqSectionKey = (typeof FAQ_SECTIONS)[number];

export const FAQ_SUBGROUPS = [
  "local_board_lead",
  "local_board",
  "event_organizer",
  "page_editor",
] as const;
export type FaqSubgroupKey = (typeof FAQ_SUBGROUPS)[number];

export type FaqEntryStatus = "draft" | "published";
export type FaqSubmissionStatus = "open" | "answered" | "discarded";

/** Shallow wie modules/events: die App rendert defensiv, das Modul prüft nur die Wurzel. */
export type TiptapDoc = { readonly type: "doc"; readonly content?: ReadonlyArray<unknown> };
export const TiptapDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.unknown()).optional(),
});
export const MAX_BODY_BYTES = 256 * 1024;

export type FaqTopic = { id: string; name: string; position: number };

export type FaqEntry = {
  id: string;
  section: FaqSectionKey;
  subgroup: FaqSubgroupKey | null;
  topicId: string | null;
  question: string;
  body: TiptapDoc;
  youtubeId: string | null;
  status: FaqEntryStatus;
  position: number;
  updatedAt: Date;
  updatedBy: string | null;
  relatedIds: readonly string[];
  contexts: readonly string[];
};

export type FaqSubmission = {
  id: string;
  question: string;
  details: string | null;
  context: string | null;
  submittedBy: string;
  status: FaqSubmissionStatus;
  entryId: string | null;
  createdAt: Date;
};

/**
 * IDs come from `core/` (CLAUDE.md §1 rule 4), like every other module.
 * The 30 seeded entries in `migrations/0002_seed.sql` keep their readable
 * slug ids — the prefix is not a format the module validates.
 */
export const newId = (): string => createId("faq");
