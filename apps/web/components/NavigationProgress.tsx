"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { BdasLoader } from "./BdasLoader";
import { shouldShowNavProgress } from "./nav-progress";

/** A navigation faster than this never shows the loader — it would only flash. */
const ANZEIGE_VERZOEGERUNG_MS = 150;
/**
 * Query-only navigations leave `usePathname()` unchanged, and a cancelled one
 * never resolves at all, so the indicator gives up rather than hanging forever.
 */
const NOTBREMSE_MS = 8000;

/**
 * Shows the brand loader while a route change is in flight.
 *
 * Deliberately client-side: a root `loading.tsx` would put every route behind a
 * Suspense boundary, and the resulting stream commits a 200 status before the
 * page can call `notFound()` (8ac77f6). This component only listens, so the
 * response status stays untouched.
 *
 * Reads `usePathname()` but never `useSearchParams()` — the latter forces its own
 * Suspense boundary in Next 14, which is exactly what has to stay out of the tree.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [sichtbar, setSichtbar] = useState(false);
  const timer = useRef<number[]>([]);

  const stoppen = useCallback(() => {
    timer.current.forEach((id) => window.clearTimeout(id));
    timer.current = [];
    setSichtbar(false);
  }, []);

  const starten = useCallback(() => {
    timer.current.forEach((id) => window.clearTimeout(id));
    timer.current = [
      window.setTimeout(() => setSichtbar(true), ANZEIGE_VERZOEGERUNG_MS),
      window.setTimeout(() => stoppen(), NOTBREMSE_MS),
    ];
  }, [stoppen]);

  useEffect(() => {
    function beiKlick(event: MouseEvent) {
      // A handler that already called preventDefault owns this click; no route change follows.
      if (event.defaultPrevented) return;

      const ziel = event.target;
      if (!(ziel instanceof Element)) return;
      const anker = ziel.closest("a");
      // SVGAElement has no string href — only HTML anchors navigate the way we track.
      if (!(anker instanceof HTMLAnchorElement)) return;

      const losgeht = shouldShowNavProgress({
        href: anker.href,
        currentUrl: window.location.href,
        target: anker.getAttribute("target"),
        hasDownload: anker.hasAttribute("download"),
        modifierKey: event.ctrlKey || event.metaKey || event.shiftKey || event.altKey,
        button: event.button,
      });
      if (losgeht) starten();
    }

    document.addEventListener("click", beiKlick);
    window.addEventListener("popstate", starten);
    return () => {
      document.removeEventListener("click", beiKlick);
      window.removeEventListener("popstate", starten);
    };
  }, [starten]);

  // The new route has painted — whatever was in flight has arrived.
  useEffect(() => {
    stoppen();
  }, [pathname, stoppen]);

  // Clear pending timers when the component itself goes away.
  useEffect(() => stoppen, [stoppen]);

  if (!sichtbar) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-bdas-nav-progress flex justify-center">
      <span className="animate-bdas-fade-slide-down rounded-bdas bg-bdas-surface px-4 py-2 shadow-bdas-card">
        <BdasLoader size="sm" />
      </span>
    </div>
  );
}
