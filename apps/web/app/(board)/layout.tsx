import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { boardScopes } from "@bdas/dashboard-shell";
import { listGroups } from "@bdas/groups";

import { loadSidebarBadgeCounts } from "../_dashboard/approvals";
import { requireDashboardFlag } from "../_dashboard/flag";
import { requireBoardAccess } from "../_dashboard/session";
import { Sidebar } from "./Sidebar";

// Board pages read the per-request session + DB; never statically prerender.
export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

export default async function BoardLayout({ children }: { children: ReactNode }) {
  requireDashboardFlag();
  const me = await requireBoardAccess();
  const groups = await listGroups(getDb());
  const scopes = boardScopes(me.grants, groups);

  // No board scope means the viewer has no grants to render here.
  if (scopes.length === 0) redirect("/account");

  const badgeCounts = await loadSidebarBadgeCounts(
    { userId: me.user.id, grants: me.grants },
    scopes,
  );

  return (
    // Stacks under `md`: a fixed 240px rail beside the content leaves ~120px of
    // usable column on a phone, which crushes every card and puts its controls
    // under the sticky header.
    <div className="mx-auto flex min-h-[calc(100vh-var(--header-h,0px))] w-full max-w-7xl flex-col md:flex-row">
      <Sidebar scopes={scopes} badgeCounts={badgeCounts} />
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
