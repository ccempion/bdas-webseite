import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { boardScopes } from "@bdas/dashboard-shell";
import { listGroups } from "@bdas/groups";

import { requireBoardAccess } from "../../_dashboard/session";

export const dynamic = "force-dynamic";

/** Landing: send the user straight to their only scope, or to the federal
 *  overview when they have several (the switcher handles the rest). */
export default async function BoardLanding() {
  const me = await requireBoardAccess();
  const scopes = boardScopes(me.grants, await listGroups(getDb()));
  const first = scopes[0];
  if (!first) redirect("/account");
  redirect(first.kind === "federal" ? "/federal/overview" : `/gruppe/${first.slug}/overview`);
}
