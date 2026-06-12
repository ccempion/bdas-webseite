import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * The board cockpit (the `(board)` route group) is gated behind BDAS_FLAG_DASHBOARD
 * until Phase 3 is acceptance-complete (CLAUDE.md §3). Off in production today.
 */
export function requireDashboardFlag(): void {
  if (!isFlagOn("dashboard")) notFound();
}
