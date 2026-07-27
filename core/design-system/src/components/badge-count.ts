/** Display cap: past two digits the exact number stops being readable at pill size. */
const MAX_SHOWN = 99;

export function badgeText(count: number): string {
  return count > MAX_SHOWN ? `${MAX_SHOWN}+` : String(count);
}

/** Screen readers get the real number even when the visible text is capped. */
export function badgeLabel(count: number, label: string): string {
  return `${count} ${label}`;
}
