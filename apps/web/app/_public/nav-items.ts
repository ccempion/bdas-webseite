import { isFlagOn } from "@bdas/feature-flags";

export type NavLeaf = { label: string; href: string };
export type NavItem = NavLeaf | { label: string; children: NavLeaf[] };

/** Top navigation. Computed per-request so flags apply. Federal board members
 *  get the management pages folded in as sub-items under Events / Gruppen.
 *  Signed-in members additionally get a "Meine Gruppe" dropdown and a "Dateien"
 *  item (both decided by the caller, which has the session + flags). */
export function navItems({
  isFederal = false,
  myGroup,
  showFiles = false,
}: {
  isFederal?: boolean;
  myGroup?: { slug: string };
  showFiles?: boolean;
} = {}): NavItem[] {
  const items: NavItem[] = [
    {
      label: "Über uns",
      children: [
        { label: "Kurzportrait", href: "/ueber-uns" },
        { label: "Verbandsstruktur", href: "/ueber-uns/verbandsstruktur" },
        { label: "Bund der Alevitischen Jugendlichen (BDAJ)", href: "/ueber-uns/bdaj" },
      ],
    },
    { label: "Unsere Arbeit", href: "/unsere-arbeit" },
  ];
  if (isFlagOn("events")) {
    items.push(
      isFederal
        ? {
            label: "Events",
            children: [
              { label: "Übersicht", href: "/events" },
              { label: "Verwalten", href: "/admin/events" },
            ],
          }
        : { label: "Events", href: "/events" },
    );
  }
  if (isFlagOn("blog")) items.push({ label: "Blog", href: "/blog" });
  if (isFlagOn("groups")) {
    items.push(
      isFederal
        ? {
            label: "Gruppen",
            children: [
              { label: "Übersicht", href: "/gruppen" },
              { label: "Verwalten", href: "/admin/gruppen" },
            ],
          }
        : { label: "Gruppen", href: "/gruppen" },
    );
  }
  if (myGroup) {
    items.push({
      label: "Meine Gruppe",
      children: [
        { label: "Übersicht", href: `/gruppen/${myGroup.slug}` },
        { label: "Events", href: `/events?groups=${myGroup.slug}` },
      ],
    });
  }
  if (showFiles) items.push({ label: "Dateien", href: "/dateien" });
  return items;
}
