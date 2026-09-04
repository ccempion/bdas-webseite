import type { Scope } from "@bdas/dashboard-shell";

import type { SidebarBadgeCounts } from "../_dashboard/approvals";

/** Sidebar nav items per scope kind. Hrefs are relative to the scope root.
 *  Pages that depend on unbuilt modules (payments, broadcasts, handover,
 *  projects, join-policy, group-change) are intentionally absent — PR 3+. */
export type NavItem = {
  readonly href: string;
  readonly label: string;
  /** Marks the one item per nav that carries the open-applications badge
   *  (issue #173) — "Ohne Gruppe" federation-wide, "Bewerbungen" per group. */
  readonly badge?: "applications";
};

export const FEDERAL_NAV: ReadonlyArray<NavItem> = [
  { href: "/federal/overview", label: "Übersicht" },
  { href: "/federal/members", label: "Mitglieder" },
  { href: "/federal/pool", label: "Ohne Gruppe", badge: "applications" },
  { href: "/federal/events", label: "Events" },
  { href: "/federal/groups", label: "Gruppen" },
  { href: "/federal/roles", label: "Rollen" },
  { href: "/federal/files", label: "Dateien" },
];

export function groupNav(slug: string): ReadonlyArray<NavItem> {
  const base = `/gruppe/${slug}`;
  return [
    { href: `${base}/overview`, label: "Übersicht" },
    { href: `${base}/members`, label: "Mitglieder" },
    { href: `${base}/bewerbungen`, label: "Bewerbungen", badge: "applications" },
    { href: `${base}/events`, label: "Events" },
    { href: `${base}/vorstand`, label: "Vorstand" },
    { href: `${base}/profil`, label: "Profil" },
    { href: `${base}/files`, label: "Dateien" },
  ];
}

/** The scope a pathname belongs to: a `/gruppe/<slug>/…` path selects that
 *  group when the viewer has it; everything else falls back to the federal
 *  scope (or the first available scope). Pure so the client sidebar can derive
 *  the active scope from `usePathname()` on every soft navigation. */
export function activeScope(scopes: ReadonlyArray<Scope>, pathname: string): Scope | undefined {
  if (pathname.startsWith("/gruppe/")) {
    const slug = pathname.split("/")[2];
    const g = scopes.find((s) => s.kind === "group" && s.slug === slug);
    if (g) return g;
  }
  return scopes.find((s) => s.kind === "federal") ?? scopes[0];
}

/** Whether a nav item is the active one for the current path. Matches the item
 *  exactly or any nested route under it (e.g. `/federal/files/<id>` keeps
 *  "Dateien" active) without bleeding across sibling items. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Open-applications count for a badge-carrying nav item, given which scope it
 *  belongs to — federation-wide for "Ohne Gruppe", that group's own for
 *  "Bewerbungen". 0 for every other item (Badge itself renders nothing then). */
export function badgeCountFor(item: NavItem, active: Scope, counts: SidebarBadgeCounts): number {
  if (item.badge !== "applications") return 0;
  return active.kind === "federal" ? counts.federal : (counts.byGroupId.get(active.groupId) ?? 0);
}
