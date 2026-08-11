"use client";

import { usePathname } from "next/navigation";
import React, { useState, type ReactNode } from "react";

/**
 * Behavioural wrapper for the mobile "Menü" disclosure: the menu closes when
 * the visitor leaves the page it is sitting on.
 *
 * The header renders in the root layout, so a client-side navigation never
 * remounts it — and a `<details>` element's `open` is DOM state React does not
 * own. Following a link therefore left the menu spread over the page it had
 * just opened.
 *
 * It closes by **remounting** rather than by assigning `open = false`. Writing
 * to the DOM behind React's back leaves the browser's view of the menu and
 * React's free to disagree, and a disclosure whose element still says "open"
 * while its contents have been replaced renders as an expanded, empty box —
 * which is what visitors reported on both Safari and Chrome. Rebuilding the
 * subtree cannot reach that state: every disclosure comes back closed and fully
 * populated because it is built from scratch.
 *
 * Remounting on a link click and not only on a route change matters: tapping
 * the entry for the page you are already on changes no route, and a menu that
 * stays open there reads as a dead link.
 *
 * Renders `display: contents` so it adds no box to the header's flex row.
 * The desktop bar has its own wrapper with different rules — see NavAutoClose.
 */
export function MobileMenuAutoClose({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [closeCount, setCloseCount] = useState(0);

  return (
    <div
      key={`${pathname}:${closeCount}`}
      className="contents"
      onClick={(e) => {
        if ((e.target as Element | null)?.closest("a")) setCloseCount((n) => n + 1);
      }}
    >
      {children}
    </div>
  );
}
