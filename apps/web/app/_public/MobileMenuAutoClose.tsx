"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

/**
 * Behavioural wrapper for the mobile "Menü" disclosure.
 *
 * The header renders in the root layout, so a client-side navigation never
 * remounts it — and a `<details>` element's `open` is plain DOM state that
 * React does not own and nothing resets. Following a link therefore left the
 * menu spread over the page it had just opened.
 *
 * Closing on a link click rather than only on a route change matters: tapping
 * the entry for the page you are already on changes no route, and leaving the
 * menu open there would look exactly like a dead link.
 *
 * Renders `display: contents` so it adds no box to the header's flex row.
 * The desktop bar has its own wrapper with different rules — see NavAutoClose.
 */
export function MobileMenuAutoClose({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Nested submenus close too, so re-opening starts collapsed instead of
  // restoring whatever section was expanded when the visitor left.
  const closeAll = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    for (const d of root.querySelectorAll("details")) d.open = false;
  }, []);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest("a")) closeAll();
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [closeAll]);

  // Covers the navigations no link click reports: back/forward, and redirects.
  useEffect(() => closeAll(), [pathname, closeAll]);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
