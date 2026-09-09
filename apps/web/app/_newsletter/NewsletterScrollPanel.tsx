"use client";

import { usePathname } from "next/navigation";
import React, { useEffect, useState, useTransition } from "react";

import { dismissPromptAction } from "./actions";
import { hasDismissed, markDismissed } from "./dismiss-marker";
import { NewsletterOffer } from "./NewsletterOffer";

/**
 * How much taller than the window a page must be before the panel is allowed
 * to exist at all.
 *
 * Scroll depth alone is not a usable trigger: on a page barely taller than the
 * window, half of it is two flicks of a trackpad, and the panel would open
 * everywhere, immediately, right on top of the footer card. At three window
 * heights the trigger below still leaves one and a half windows underneath the
 * reader, so the footer is out of sight and the rule this PR is built on holds:
 * inline surfaces are for the middle of a page, the end belongs to the footer.
 *
 * The three is a setting, not a derivation. It stands here so it can be changed
 * without a search.
 */
export const MIN_PAGE_HEIGHT_FACTOR = 3;

/** How much of the page must have been *seen* — not how far the scrollbar has
 *  travelled. The window already shows one screenful at rest, and counting it
 *  is what puts the trigger where the arithmetic above expects it. */
export const SCROLL_DEPTH = 0.5;

/** Pages that already ask the question in their own words. A second offer
 *  sliding in over the first is the noise this PR set out to avoid. */
const QUIET_PATHS = ["/newsletter", "/account", "/registrieren/erfolg"];

export function panelIsDue({
  pageHeight,
  viewportHeight,
  scrollY,
  footerTop,
}: {
  pageHeight: number;
  viewportHeight: number;
  scrollY: number;
  /** The footer's distance from the top of the WINDOW, as
   *  `getBoundingClientRect().top` gives it. `Infinity` when there is no
   *  footer on the page at all. */
  footerTop: number;
}): boolean {
  if (pageHeight <= 0 || viewportHeight <= 0) return false;
  if (pageHeight < viewportHeight * MIN_PAGE_HEIGHT_FACTOR) return false;
  if ((scrollY + viewportHeight) / pageHeight < SCROLL_DEPTH) return false;

  // And the other half of the rule: the panel goes away again the moment the
  // footer comes into view. Without this it sits over the footer at the foot
  // of the page and swallows its links — which is precisely what
  // `public-shell.e2e.ts` ("leaves the foot of the page reachable") exists to
  // catch, and what it caught.
  //
  // Measured against the real footer rather than a reserved strip of pixels:
  // "the end of the page belongs to the footer" is then literally what the
  // code checks, and it stays true when the footer grows.
  return footerTop >= viewportHeight;
}

/**
 * D2 from spec §6: the panel that slides in halfway down a long page.
 *
 * The decision is split in two on purpose. The server says *whether* it may
 * ever appear — flag, session, subscription, and for an account the §6.1
 * fortnight — and hands that down as `state`. The browser says *when*. A panel
 * that decided its own visibility client-side would flash up for a subscriber
 * before the answer arrived.
 *
 * "When" is a band, not a threshold: it opens once half a long page has been
 * seen and closes again as the footer comes into view. Both halves say the
 * same thing — inline surfaces are for the middle of a page, the end belongs
 * to the footer.
 *
 * `state === null` means never, and the mount already renders nothing in that
 * case; the guard is repeated here so the rule is testable where it is written.
 */
export function NewsletterScrollPanel({ state }: { state: "guest" | "member" | null }) {
  const [due, setDue] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();
  const pathname = usePathname();

  const quiet = state === null || QUIET_PATHS.includes(pathname);

  useEffect(() => {
    if (quiet) return;
    // Read after mount, never during render: `sessionStorage` does not exist on
    // the server and the mismatch would be a hydration error.
    if (hasDismissed()) {
      setDismissed(true);
      return;
    }

    const measure = () => {
      // The last one: the layout renders the site footer at the end of the
      // body, and a page is free to carry a `<footer>` of its own inside its
      // content.
      const footer = [...document.querySelectorAll("footer")].pop();
      setDue(
        panelIsDue({
          pageHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          scrollY: window.scrollY,
          footerTop: footer ? footer.getBoundingClientRect().top : Infinity,
        }),
      );
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [quiet]);

  if (quiet || dismissed || !due) return null;

  function dismiss() {
    setDismissed(true);
    // A guest is remembered in the browser for this visit only. An account is
    // remembered on the server, where the fortnight and the cap at three live
    // (`declineForUser`) — so the answer follows the person across devices.
    if (state === "member") {
      startTransition(() => {
        void dismissPromptAction({}, new FormData());
      });
    } else {
      markDismissed();
    }
  }

  return (
    <div
      data-newsletter-panel
      // z-30 keeps the header dropdowns (z-40) and the cookie notice (z-50)
      // on top; `bottom-24` keeps the FAQ help launcher, which sits at
      // bottom-6 with a 3rem button, out from under the panel.
      //
      // The offer inside brings its own border, padding and radius, so the
      // wrapper adds only the lift and an opaque ground — one card, not a
      // card inside a card.
      className="fixed inset-x-4 bottom-24 z-30 overflow-hidden rounded-bdas bg-bdas-surface
        shadow-bdas-card motion-safe:animate-bdas-fade-slide-up sm:left-auto sm:right-6 sm:w-96"
      role="complementary"
      aria-label="Newsletter"
    >
      <NewsletterOffer
        state={state === "member" ? "member" : "guest"}
        source="scroll_panel"
        sourcePath={pathname}
      />
      <button
        type="button"
        data-newsletter-panel-dismiss
        onClick={dismiss}
        aria-label="Hinweis schließen"
        className="absolute right-2 top-2 rounded-bdas-sm px-2 py-1 text-lg leading-none
          text-bdas-ink-muted transition-colors duration-bdas-quick ease-bdas
          hover:text-bdas-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-red"
      >
        ×
      </button>
    </div>
  );
}
