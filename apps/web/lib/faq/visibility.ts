import type { Role } from "@bdas/auth";

import type { FaqSection, FaqVisibility } from "../../content/faq";
import type { FaqGrant } from "./order";

/** True if the viewer holds at least one of the given roles. */
export function hasAny(grants: readonly FaqGrant[], roles: readonly Role[]): boolean {
  const held = new Set(grants.map((g) => g.role));
  return roles.some((role) => held.has(role));
}

/** Whether a section's (or subgroup's) `visibleTo` tag admits this viewer. */
export function isVisibleTo(visibleTo: FaqVisibility, grants: readonly FaqGrant[]): boolean {
  return visibleTo === "all" || hasAny(grants, visibleTo);
}

/**
 * Narrows a section's subgroups (only `vorstand` has any) to the ones the
 * viewer's own grants admit — holding one board sub-role doesn't unlock
 * another sub-role's exclusive content. Call only on a section that already
 * passed {@link isVisibleTo} at the section level; the section's own
 * top-level `entries` (shared, non-subgroup content) are returned unchanged.
 */
export function narrowSubgroups(section: FaqSection, grants: readonly FaqGrant[]): FaqSection {
  if (!section.subgroups) return section;
  return {
    ...section,
    subgroups: section.subgroups.filter((sub) => hasAny(grants, sub.visibleTo)),
  };
}
