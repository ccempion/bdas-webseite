import type { FaqEntryView, FaqSectionView, FaqSubgroupView } from "../../lib/faq/assemble";

function matches(entry: FaqEntryView, query: string, topicId: string | null): boolean {
  if (topicId !== null && entry.topic?.id !== topicId) return false;
  if (query !== "" && !entry.searchText.includes(query)) return false;
  return true;
}

/**
 * Pure filter over the assembled view model: query lowercased against
 * `entry.searchText`, topic against `entry.topic?.id`. Subgroups and
 * sections left with no matching entries are dropped rather than rendered
 * empty.
 */
export function filterSections(
  sections: FaqSectionView[],
  opts: { query: string; topicId: string | null },
): FaqSectionView[] {
  const query = opts.query.trim().toLowerCase();
  const { topicId } = opts;

  const out: FaqSectionView[] = [];
  for (const section of sections) {
    const entries = section.entries.filter((e) => matches(e, query, topicId));

    const subgroups: FaqSubgroupView[] = [];
    for (const sub of section.subgroups) {
      const subEntries = sub.entries.filter((e) => matches(e, query, topicId));
      if (subEntries.length > 0) subgroups.push({ ...sub, entries: subEntries });
    }

    if (entries.length === 0 && subgroups.length === 0) continue;
    out.push({ ...section, entries, subgroups });
  }
  return out;
}
