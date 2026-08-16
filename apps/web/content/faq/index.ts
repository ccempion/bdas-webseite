import { allgemein } from "./allgemein";
import { bundesvorstand } from "./bundesvorstand";
import { mitglieder } from "./mitglieder";
import type { FaqSection, SectionKey } from "./types";
import { vorstand } from "./vorstand";

export type {
  FaqBlock,
  FaqEntry,
  FaqSection,
  FaqSubgroup,
  FaqVisibility,
  SectionKey,
} from "./types";

/** All FAQ sections, keyed by section for lookup by the ordering logic. */
export const SECTIONS: Readonly<Record<SectionKey, FaqSection>> = {
  allgemein,
  bundesvorstand,
  vorstand,
  mitglieder,
};
