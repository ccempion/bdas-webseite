import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { canAdministerBoard, canSeeFederalScope, canSeeGroupScope } from "@bdas/dashboard-shell";
import { canGrantLocalBoard, getCurrentMember, type CurrentMember } from "@bdas/members";
import { getGroupBySlug } from "@bdas/groups";

import { readSessionCookie } from "../../lib/auth-cookie";

/** Resolve the signed-in board user, or redirect. Used by the (board) layout. */
export async function requireBoardAccess(): Promise<CurrentMember> {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) redirect("/anmelden");
  if (!canAdministerBoard(me.grants)) redirect("/account");
  return me;
}

/** Federal scope gate. Assumes requireBoardAccess already ran in a parent layout. */
export async function requireFederalScope(): Promise<CurrentMember> {
  const me = await requireBoardAccess();
  if (!canSeeFederalScope(me.grants)) redirect("/account");
  return me;
}

/** Group scope gate. Resolves the slug → group; 404 on unknown slug; redirect
 *  to /account when the user may not see that group. Returns the member + group id. */
export async function requireGroupScope(
  slug: string,
): Promise<{ me: CurrentMember; groupId: string }> {
  const me = await requireBoardAccess();
  const group = await getGroupBySlug(getDb(), slug);
  if (!group) redirect("/account");
  if (!canSeeGroupScope(me.grants, group.id)) redirect("/account");
  return { me, groupId: group.id };
}

/** Lead-only gate for /gruppe/[slug]/vorstand: federal or a local_board_lead
 *  of this group (canGrantLocalBoard, ADR 0013). */
export async function requireLeadScope(
  slug: string,
): Promise<{ me: CurrentMember; groupId: string }> {
  const { me, groupId } = await requireGroupScope(slug);
  if (!canGrantLocalBoard(me.grants, groupId)) redirect(`/gruppe/${slug}/overview`);
  return { me, groupId };
}
