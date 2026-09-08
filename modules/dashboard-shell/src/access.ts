import { canManageGroup, isFederalBoard } from "@bdas/members";
import type { Grant } from "@bdas/members";
import type { GroupStatus } from "@bdas/groups";

/** May this user enter the cockpit at all? Federal board or a group's Lead
 *  qualifies; a plain member does not. */
export function canAdministerBoard(grants: ReadonlyArray<Grant>): boolean {
  return grants.some((g) => g.role === "federal_board" || g.role === "local_board_lead");
}

/** The `/federal/*` scope is federal-board only. */
export function canSeeFederalScope(grants: ReadonlyArray<Grant>): boolean {
  return isFederalBoard(grants);
}

/** A `/gruppe/[slug]` scope: federal (superset — incl. archived groups, which it
 *  winds down) or the Lead of that group. A Lead may NOT manage an archived
 *  group; only federal can. `canManageGroup` encodes "federal OR Lead of this
 *  group". */
export function canSeeGroupScope(
  grants: ReadonlyArray<Grant>,
  group: { readonly id: string; readonly status: GroupStatus },
): boolean {
  if (isFederalBoard(grants)) return true;
  if (group.status === "archived") return false;
  return canManageGroup(grants, group.id);
}
