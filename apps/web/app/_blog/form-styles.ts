/**
 * Shared input styling for blog forms. Extracted so the report form and the
 * comment composer cannot drift apart visually — they are the same control in
 * two places, not two independent designs.
 */
export const TEXTAREA_CLASS =
  "block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2 " +
  "text-sm text-bdas-ink focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20";
