/**
 * The searching and keyboard-navigation logic behind Combobox, kept free of
 * React so it can be tested directly.
 */

export type ComboboxOption = {
  readonly value: string;
  readonly label: string;
};

/** Above this many options a list stops being scannable and the Combobox
 *  reveals its search field. Below it the field would only be in the way. */
export const SEARCH_THRESHOLD = 30;

export function shouldSearch(optionCount: number, threshold = SEARCH_THRESHOLD): boolean {
  return optionCount > threshold;
}

/** Combining marks left behind by NFD — stripping them turns "ä" into "a". */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Casefolded, punctuation-free and umlaut-free, so "tu munchen", "TU-München"
 *  and "tu münchen" all reach the same place. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The same, but spelling umlauts out, so someone typing "muenchen" on a
 *  keyboard without umlauts still finds "München". */
function foldExpanded(text: string): string {
  return fold(text.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue"));
}

/** Every whitespace-separated term has to match somewhere, so "uni köln" and
 *  "köln uni" both find "Universität zu Köln". */
function matchesEveryTerm(haystacks: readonly string[], terms: readonly string[]): boolean {
  return terms.every((term) => haystacks.some((h) => h.includes(term)));
}

/** Options whose label matches every term in `query`, best matches first: a
 *  label that starts with the query beats one that merely contains it, and
 *  ties keep the order they came in (the list is already sorted). */
export function filterOptions(
  options: ReadonlyArray<ComboboxOption>,
  query: string,
): ReadonlyArray<ComboboxOption> {
  const folded = fold(query);
  if (folded === "") return options;

  const terms = folded.split(" ");
  const ranked: Array<{ option: ComboboxOption; rank: number; order: number }> = [];

  options.forEach((option, order) => {
    const plain = fold(option.label);
    const expanded = foldExpanded(option.label);
    if (!matchesEveryTerm([plain, expanded], terms)) return;
    ranked.push({ option, rank: plain.startsWith(folded) ? 0 : 1, order });
  });

  return ranked.sort((a, b) => a.rank - b.rank || a.order - b.order).map((entry) => entry.option);
}

/** Where the highlight lands after an arrow key. Wraps at both ends, and
 *  treats "nothing highlighted yet" as starting just outside the list so the
 *  first Down goes to the top and the first Up to the bottom. */
export function nextIndex(current: number, count: number, delta: number): number {
  if (count === 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return (current + delta + count) % count;
}

/** Keeps the highlight on the same option across a re-filter where possible,
 *  so typing another letter does not silently move the selection. Falls back
 *  to the first option, which is what Enter should pick after a search. */
export function reconcileIndex(
  visible: ReadonlyArray<ComboboxOption>,
  previousValue: string | undefined,
): number {
  if (visible.length === 0) return -1;
  if (previousValue === undefined) return 0;
  const kept = visible.findIndex((o) => o.value === previousValue);
  return kept === -1 ? 0 : kept;
}
