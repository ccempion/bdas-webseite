/** Sidebar nav items per scope kind. Hrefs are relative to the scope root.
 *  Pages that depend on unbuilt modules (payments, broadcasts, handover,
 *  projects, join-policy, group-change) are intentionally absent — PR 3+. */
export type NavItem = { readonly href: string; readonly label: string };

export const FEDERAL_NAV: ReadonlyArray<NavItem> = [
  { href: "/federal/overview", label: "Übersicht" },
  { href: "/federal/members", label: "Mitglieder" },
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
    { href: `${base}/events`, label: "Events" },
    { href: `${base}/vorstand`, label: "Vorstand" },
    { href: `${base}/profile`, label: "Profil" },
    { href: `${base}/files`, label: "Dateien" },
  ];
}
