import { canAdministerBoard } from "@bdas/dashboard-shell";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroup } from "@bdas/groups";

import { faqEnabled } from "../../lib/faq/enabled";
import { loadApprovalCounts } from "../_dashboard/approvals";
import { loadCurrentMember } from "../_dashboard/session";
import { navItems } from "./nav-items";
import { PublicHeaderView } from "./PublicHeaderView";

/** Loads everything the header needs and hands it to the pure view. The split
 *  is what lets the Puck canvas render the same chrome: the canvas is a client
 *  tree inside an iframe and cannot do any of these reads. */
export async function PublicHeader() {
  const me = await loadCurrentMember();
  const isBoard = me ? canAdministerBoard(me.grants) : false;
  const approvals = isBoard ? await loadApprovalCounts() : null;
  const openCount = approvals?.total ?? 0;

  // "Meine Gruppe" links into the public group page; it needs the group's slug
  // and only makes sense while groups are enabled and the group is not archived
  // (its public page 404s otherwise).
  const groupId = me?.member?.primaryGroupId ?? null;
  const group = groupId && isFlagOn("groups") ? await getGroup(getDb(), groupId) : null;
  const myGroup =
    group && group.status !== "archived" ? { slug: group.slug, name: group.name } : undefined;

  // Files access is per member-kind, independent of the group page; flag-gate it
  // so the item never renders while BDAS_FLAG_FILES is off (no dead link).
  const showFiles = Boolean(me?.member) && isFlagOn("files");

  const items = navItems({
    isLoggedIn: Boolean(me),
    ...(myGroup ? { myGroup } : {}),
    showFiles,
  });

  return (
    <PublicHeaderView
      items={items}
      konto={
        me
          ? {
              displayName: me.member?.firstName ?? "Konto",
              isBoard,
              openCount,
              showFaq: faqEnabled(),
            }
          : null
      }
    />
  );
}
