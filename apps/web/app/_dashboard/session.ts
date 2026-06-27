import { cache } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser, type CurrentUser } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { canAdministerBoard, canSeeFederalScope, canSeeGroupScope } from "@bdas/dashboard-shell";
import { isFlagOn } from "@bdas/feature-flags";
import { canGrantLocalBoard, getCurrentMember, type CurrentMember } from "@bdas/members";
import { getGroupBySlug } from "@bdas/groups";

import { readSessionCookie } from "../../lib/auth-cookie";

/** Lightweight "is anyone signed in?" read for public/guest surfaces, deduped
 *  per request. Unlike {@link loadCurrentMember} it resolves only the auth
 *  user (no grants join), which is all guest-only gating needs. Returns null
 *  when the auth module is flagged off. */
export const loadViewer = cache(
  (): Promise<CurrentUser | null> =>
    isFlagOn("auth") ? getCurrentUser(getDb(), readSessionCookie()) : Promise.resolve(null),
);

/** Resolve the current member, deduplicated per request. A board render touches
 *  this ~3× (the (board) layout, the scope layout, and the page); `cache()`
 *  collapses them into a single DB read, cutting the connection pressure that
 *  was tipping heavy board pages into 504 timeouts. Pages that need `me` should
 *  call this, not `getCurrentMember` directly. */
export const loadCurrentMember = cache(
  (): Promise<CurrentMember | null> => getCurrentMember(getDb(), readSessionCookie()),
);

/** Resolve the signed-in board user, or redirect. Used by the (board) layout. */
export const requireBoardAccess = cache(async (): Promise<CurrentMember> => {
  const me = await loadCurrentMember();
  if (!me) redirect("/anmelden");
  if (!canAdministerBoard(me.grants)) redirect("/account");
  return me;
});

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
  if (!canSeeGroupScope(me.grants, group)) redirect("/account");
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
