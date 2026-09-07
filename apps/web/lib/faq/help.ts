import type { FaqEntryView, FaqSectionView } from "./assemble";

/**
 * Every entry a viewer may see, flat. The input is always the output of
 * `assembleFaq`, so visibility has already been applied — this file must
 * never re-decide who sees what (Spec §7: the panel is "gefiltert durch
 * dieselbe Sichtbarkeitslogik wie /faq").
 */
export function flattenSections(sections: readonly FaqSectionView[]): FaqEntryView[] {
  const out: FaqEntryView[] = [];
  for (const section of sections) {
    out.push(...section.entries);
    for (const sub of section.subgroups) out.push(...sub.entries);
  }
  return out;
}

export function partitionByContext(
  entries: readonly FaqEntryView[],
  contextKey: string | null,
): { inContext: FaqEntryView[]; rest: FaqEntryView[] } {
  if (contextKey === null) return { inContext: [], rest: [...entries] };
  const inContext: FaqEntryView[] = [];
  const rest: FaqEntryView[] = [];
  for (const e of entries) (e.contexts.includes(contextKey) ? inContext : rest).push(e);
  return { inContext, rest };
}

/**
 * The "Beliebte Fragen" fallback (Spec §7) when no entry is pinned to the
 * current route. `assembleFaq` already hoists the viewer's own section to the
 * front (order.ts), so taking from the top is what "Bereich des Viewers" means.
 */
export function popularFrom(sections: readonly FaqSectionView[], limit: number): FaqEntryView[] {
  return flattenSections(sections).slice(0, limit);
}

/**
 * The panel's mini-search, over the already-visible entries only. Generic over
 * anything carrying `searchText` — the help panel searches `FaqHelpEntry`, the
 * trimmed wire shape, not the full `FaqEntryView`.
 */
export function searchEntries<T extends { searchText: string }>(
  entries: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...entries];
  return entries.filter((e) => e.searchText.includes(q));
}
