import type { FaqEntry, FaqSectionKey, FaqSubgroupKey } from "@bdas/faq";

export type ScopeGroup = {
  section: FaqSectionKey;
  subgroup: FaqSubgroupKey | null;
  entries: FaqEntry[];
};

export function groupByScope(entries: readonly FaqEntry[]): ScopeGroup[] {
  const groups = new Map<string, ScopeGroup>();
  for (const entry of entries) {
    const key = `${entry.section}:${entry.subgroup ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = { section: entry.section, subgroup: entry.subgroup, entries: [] };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()];
}
