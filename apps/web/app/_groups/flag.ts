import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * Group routes are flag-gated until the public site is ready (Sprint 5
 * acceptance pass). Local devs flip BDAS_FLAG_GROUPS=true to preview.
 */
export function requireGroupsFlag(): void {
  if (!isFlagOn("groups")) notFound();
}
