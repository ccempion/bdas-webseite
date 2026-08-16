import { isFlagOn } from "@bdas/feature-flags";

import { faqEnabled } from "../../lib/faq/enabled";
import { navItems, type NavItem } from "../_public/nav-items";

export type CanvasChrome = {
  navItems: NavItem[];
  events: boolean;
  groups: boolean;
  faq: boolean;
};

/**
 * Everything the editor canvas's decorative chrome needs, computed on the
 * server and handed to `<Puck metadata>`.
 *
 * The canvas is a client tree: `isFlagOn` reads `process.env` with a *computed*
 * key (`BDAS_FLAG_${NAME}`), which Next cannot statically inline — and a
 * non-`NEXT_PUBLIC_` variable never reaches the browser regardless. Calling
 * `navItems()` inside the canvas would therefore read every flag as false and
 * silently drop Events, Blog, Gruppen and the Bundessprecher*innenrat entry,
 * leaving the canvas header disagreeing with the canvas footer sitting a few
 * centimetres below it.
 *
 * The visitor's nav, not the signed-in board member's: the board is previewing
 * a public page.
 */
export function canvasChrome(): CanvasChrome {
  return {
    navItems: navItems({ isLoggedIn: false }),
    events: isFlagOn("events"),
    groups: isFlagOn("groups"),
    faq: faqEnabled(),
  };
}
