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

/** The already-visible entries pinned to `contextKey`; none without one. */
export function entriesForContext(
  entries: readonly FaqEntryView[],
  contextKey: string | null,
): FaqEntryView[] {
  if (contextKey === null) return [];
  return entries.filter((e) => e.contexts.includes(contextKey));
}

/**
 * The "Beliebte Fragen" fallback (Spec §7) when no entry is pinned to the
 * current route. `assembleFaq` already hoists the viewer's own section to the
 * front (order.ts) and `flattenSections` preserves that order, so taking from
 * the top is what "Bereich des Viewers" means.
 */
export function popularFrom<T>(entries: readonly T[], limit: number): T[] {
  return entries.slice(0, limit);
}

/**
 * Resolves the id lists the help route sends beside its one entry list back
 * into entries. The route sends ids rather than repeating whole entries in
 * three overlapping arrays — an entry carries its full Tiptap body and then
 * the same body again as lowercased `searchText`. Unknown ids are skipped.
 */
export function pickByIds<T extends { id: string }>(
  entries: readonly T[],
  ids: readonly string[],
): T[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: T[] = [];
  for (const id of ids) {
    const found = byId.get(id);
    if (found) out.push(found);
  }
  return out;
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
