import { canManageGroup, isFederalBoard } from "@bdas/members";
import type { Grant } from "@bdas/members";

/** May this user enter the cockpit at all? Any board grant (federal, local
 *  board, or lead) qualifies; a plain member does not. */
export function canAdministerBoard(grants: ReadonlyArray<Grant>): boolean {
  return grants.some(
    (g) => g.role === "federal_board" || g.role === "local_board" || g.role === "local_board_lead",
  );
}

/** The `/federal/*` scope is federal-board only. */
export function canSeeFederalScope(grants: ReadonlyArray<Grant>): boolean {
  return isFederalBoard(grants);
}

/** A `/gruppe/[slug]` scope: federal (superset) or a board of that group.
 *  `canManageGroup` already encodes "federal OR local_board of this group";
 *  a lead also manages its group, so include it explicitly. */
export function canSeeGroupScope(grants: ReadonlyArray<Grant>, groupId: string): boolean {
  if (canManageGroup(grants, groupId)) return true;
  return grants.some((g) => g.role === "local_board_lead" && g.groupId === groupId);
}
