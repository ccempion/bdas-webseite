/**
 * Decides whether an anchor click starts an in-app navigation worth showing the
 * brand loader for.
 *
 * The loader cannot live in a root `loading.tsx`: that wraps every route in a
 * Suspense boundary, which makes Next stream the 200 status line before the page
 * runs, so a later `notFound()` can no longer set 404 (see 8ac77f6). Every route
 * segment sits behind a feature-flag gate that calls `notFound()` (CLAUDE.md §3
 * rule 6), so no segment can host a scoped loader either. Watching clicks
 * client-side never touches the response status.
 */

export type NavClickIntent = {
  /** Absolute URL the anchor points at. */
  href: string;
  /** Absolute URL currently shown. */
  currentUrl: string;
  /** The anchor's `target` attribute, if any. */
  target: string | null;
  /** Whether the anchor carries a `download` attribute. */
  hasDownload: boolean;
  /** Ctrl / Meta / Shift / Alt held — the browser opens a new tab or window. */
  modifierKey: boolean;
  /** `MouseEvent.button`; only the primary button navigates in place. */
  button: number;
};

export function shouldShowNavProgress(intent: NavClickIntent): boolean {
  if (intent.button !== 0) return false;
  if (intent.modifierKey) return false;
  if (intent.hasDownload) return false;
  if (intent.target !== null && intent.target !== "" && intent.target !== "_self") return false;

  let href: URL;
  let current: URL;
  try {
    href = new URL(intent.href);
    current = new URL(intent.currentUrl);
  } catch {
    return false;
  }

  // mailto:, tel: and blob: downloads leave the app; only http(s) renders a route.
  if (href.protocol !== "http:" && href.protocol !== "https:") return false;
  if (href.origin !== current.origin) return false;

  // Same page: either a bare `#anchor` jump or a re-click on the current link.
  // Neither fetches a new route, so a loader would flash for nothing.
  if (href.pathname === current.pathname && href.search === current.search) return false;

  return true;
}
