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
import { canAdministerBoard } from "@bdas/dashboard-shell";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { countPendingApprovals, isFederalBoard } from "@bdas/members";

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
