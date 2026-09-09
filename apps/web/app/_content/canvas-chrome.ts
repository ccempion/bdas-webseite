import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";

import { faqEnabled } from "../../lib/faq/enabled";
import { readSessionCookie } from "../../lib/auth-cookie";
import { newsletterEnabled } from "../_newsletter/flag";
import { readNewsletterViewerState, type NewsletterViewerState } from "../_newsletter/viewer-state";
import { navItems, type NavItem } from "../_public/nav-items";

/** The visitor states from §6, plus the one the editor adds: on the canvas
 *  nobody is a visitor, so the newsletter block shows an inert stand-in. */
export type NewsletterCanvasState = NewsletterViewerState | "editor";

export type CanvasChrome = {
  navItems: NavItem[];
  events: boolean;
  groups: boolean;
  faq: boolean;
  newsletter: NewsletterCanvasState;
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
    // Fixed, the way the canvas footer is fixed to `showNewsletter={false}`:
    // a board member opening the page preview must not be able to sign
    // themselves up from inside the editor.
    //
    // One field, not an `enabled` boolean beside a state: "off" is already one
    // of the states, and two fields saying the same thing drift apart.
    newsletter: newsletterEnabled() ? "editor" : "off",
  };
}

/**
 * The same metadata for the public `<Render>`. The newsletter block needs the
 * viewer's state, and the canvas taught us the transport: a client tree cannot
 * read flags, a session or the database, so the server hands it down.
 *
 * `path` is the page's public path, recorded with a signup so §4 can later say
 * which surface brought someone in. It is not the editor's `slug`, which is an
 * upload-authorization key and differs from the path on group pages.
 */
export async function pageMetadata(path: string): Promise<{ chrome: CanvasChrome; path: string }> {
  return {
    chrome: {
      ...canvasChrome(),
      newsletter: await readNewsletterViewerState(getDb(), readSessionCookie()),
    },
    path,
  };
}
