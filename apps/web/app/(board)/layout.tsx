import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { boardScopes, type Scope } from "@bdas/dashboard-shell";
import { listGroups } from "@bdas/groups";

import { requireDashboardFlag } from "../_dashboard/flag";
import { requireBoardAccess } from "../_dashboard/session";
import { Sidebar } from "./Sidebar";

// Board pages read the per-request session + DB; never statically prerender.
export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

function activeScope(scopes: Scope[], pathname: string): Scope | undefined {
  if (pathname.startsWith("/gruppe/")) {
    const slug = pathname.split("/")[2];
    const g = scopes.find((s) => s.kind === "group" && s.slug === slug);
    if (g) return g;
  }
  return scopes.find((s) => s.kind === "federal") ?? scopes[0];
}

export default async function BoardLayout({ children }: { children: ReactNode }) {
  requireDashboardFlag();
  const me = await requireBoardAccess();
  const groups = await listGroups(getDb());
  const scopes = boardScopes(me.grants, groups);

  // next/headers exposes the matched pathname via the x-… header Next sets on
  // RSC requests; fall back to the federal/first scope when unavailable.
  const pathname = headers().get("x-pathname") ?? headers().get("x-invoke-path") ?? "";
  const active = activeScope(scopes, pathname);
  if (!active) redirect("/account");

  return (
    <div className="mx-auto flex min-h-[calc(100vh-var(--header-h,0px))] w-full max-w-7xl">
      <Sidebar scopes={scopes} active={active} activePath={pathname} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
