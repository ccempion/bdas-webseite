import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { boardScopes } from "@bdas/dashboard-shell";
import { listGroups } from "@bdas/groups";

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

  return (
    <div className="mx-auto flex min-h-[calc(100vh-var(--header-h,0px))] w-full max-w-7xl">
      <Sidebar scopes={scopes} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
