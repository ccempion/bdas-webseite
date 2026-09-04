/**
 * How many decisions wait for the current viewer, across every queue that ends
 * in one click: incoming applications, incoming group transfers, open post
 * reports.
 *
 * Rendered by the site-wide header, so the order of the guards below is load
 * bearing — a viewer with no board role must not cause a single query.
 */
import { cache } from "react";

import { countOpenReports } from "@bdas/blog";
import { canAdministerBoard, type Scope } from "@bdas/dashboard-shell";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import {
  countPendingApplicationsByGroup,
  countPendingApprovals,
  isFederalBoard,
  type Actor,
} from "@bdas/members";

import { loadCurrentMember } from "./session";

export type ApprovalSummary = {
  readonly applications: number;
  readonly groupTransfers: number;
  readonly openReports: number;
  readonly total: number;
};

const NONE: ApprovalSummary = {
  applications: 0,
  groupTransfers: 0,
  openReports: 0,
  total: 0,
};

export const loadApprovalCounts = cache(async (): Promise<ApprovalSummary> => {
  const me = await loadCurrentMember();
  if (!me || !canAdministerBoard(me.grants)) return NONE;

  const db = getDb();
  const actor = { userId: me.user.id, grants: me.grants };

  const members = isFlagOn("members")
    ? await countPendingApprovals(db, actor)
    : { applications: 0, groupTransfers: 0 };

  const openReports =
    isFederalBoard(me.grants) && isFlagOn("blog") ? await countOpenReports(db) : 0;

  return {
    applications: members.applications,
    groupTransfers: members.groupTransfers,
    openReports,
    total: members.applications + members.groupTransfers + openReports,
  };
});

export type SidebarBadgeCounts = {
  /** Federation-wide open applications, shown next to "Ohne Gruppe". */
  readonly federal: number;
  /** Open applications per group scope, shown next to that group's "Bewerbungen". */
  readonly byGroupId: ReadonlyMap<string, number>;
};

const NO_BADGES: SidebarBadgeCounts = { federal: 0, byGroupId: new Map() };

/**
 * Nav-badge counts for the board sidebar, one per scope the viewer can switch
 * to. Reuses `countPendingApprovals`/`countPendingApplicationsByGroup` — the
 * same decidable-applications gate the header/account alert already uses —
 * so the sidebar badge never disagrees with those about what counts as
 * "yours to decide". `actor`/`scopes` come from the board layout, which has
 * already resolved both; this does not re-fetch the session.
 */
export async function loadSidebarBadgeCounts(
  actor: Actor,
  scopes: ReadonlyArray<Scope>,
): Promise<SidebarBadgeCounts> {
  if (!isFlagOn("members")) return NO_BADGES;

  const db = getDb();
  const groupIds = scopes.flatMap((s) => (s.kind === "group" ? [s.groupId] : []));

  const [federalCounts, byGroupId] = await Promise.all([
    isFederalBoard(actor.grants) ? countPendingApprovals(db, actor) : null,
    groupIds.length > 0
      ? countPendingApplicationsByGroup(db, actor, groupIds)
      : new Map<string, number>(),
  ]);

  return { federal: federalCounts?.applications ?? 0, byGroupId };
}
