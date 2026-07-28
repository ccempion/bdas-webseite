import { REJECTION_CATEGORY_LABELS, type RejectionCategory } from "@bdas/members";

/**
 * Server-only: importing a runtime value from `@bdas/members` drags the module
 * barrel — and through it `@bdas/auth` and `node:crypto` — into whatever bundle
 * reaches it, which webpack cannot resolve for the browser. Client components
 * take the resolved labels as props; they may import only *types* from the
 * module, as the rest of `_components` does.
 */

/**
 * Dropdown order for the board. The labels themselves come from the members
 * module, which owns the column — duplicating them here would let the email and
 * the dropdown drift apart.
 */
export const REJECTION_CATEGORIES: ReadonlyArray<{
  readonly key: RejectionCategory;
  readonly label: string;
}> = (["no_contact", "not_a_student", "other"] as const).map((key) => ({
  key,
  label: REJECTION_CATEGORY_LABELS[key],
}));

export function categoryLabel(key: string | null): string {
  if (key !== null && key in REJECTION_CATEGORY_LABELS) {
    return REJECTION_CATEGORY_LABELS[key as RejectionCategory];
  }
  return "Kein Grund angegeben";
}
