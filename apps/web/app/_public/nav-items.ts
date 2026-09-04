import { isFlagOn } from "@bdas/feature-flags";

export type NavLeaf = { label: string; href: string };
export type NavItem = NavLeaf | { label: string; children: NavLeaf[] };

/** Top navigation. Computed per-request so flags apply. Signed-out visitors get
 *  a "Gruppen" link to browse all groups; signed-in members instead get a link
 *  to their own local group (plus a "Dateien" item). The caller owns the
 *  session + flags and passes the derived values in. */
export function navItems({
  isLoggedIn = false,
  myGroup,
  showFiles = false,
}: {
  isLoggedIn?: boolean;
  myGroup?: { slug: string; name: string };
  showFiles?: boolean;
} = {}): NavItem[] {
  const items: NavItem[] = [
    {
      label: "Über uns",
      children: [
        { label: "Kurzportrait", href: "/ueber-uns" },
        ...(isFlagOn("content")
          ? [{ label: "Bundessprecher*innenrat", href: "/ueber-uns/bundessprecherinnenrat" }]
          : []),
        { label: "Verbandsstruktur", href: "/ueber-uns/verbandsstruktur" },
        { label: "Bund der Alevitischen Jugendlichen (BDAJ)", href: "/ueber-uns/bdaj" },
      ],
    },
  ];
  if (isFlagOn("events")) {
    items.push({ label: "Events", href: "/events" });
  }
  if (isFlagOn("blog")) items.push({ label: "Blog", href: "/blog" });
  // Browse-all-groups link, for signed-out visitors only. Signed-in members
  // navigate via their own group below, so "Gruppen" is dropped for them.
  if (isFlagOn("groups") && !isLoggedIn) {
    items.push({ label: "Gruppen", href: "/gruppen" });
  }
  if (myGroup) {
    items.push({ label: myGroup.name, href: `/gruppen/${myGroup.slug}` });
  }
  if (showFiles) items.push({ label: "Dateien", href: "/dateien" });
  return items;
}
