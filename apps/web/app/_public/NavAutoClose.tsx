"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Behavioural wrapper for the desktop nav's `<details>` dropdowns. Native
 * `<details>` open independently and only close on a second click of their own
 * summary. This adds the two behaviours users expect of a menu bar:
 *
 *  1. **Only one open at a time** — opening one closes the others.
 *  2. **Click-away / Escape closes** — clicking anywhere outside an open
 *     dropdown (or pressing Escape) closes it.
 *
 * The wrapper renders `display: contents` so it adds no box to the flex layout.
 * The "close others" listener is attached in the **capture** phase, which fires
 * even though `toggle` doesn't bubble — so it keeps working if the set of
 * dropdowns changes (e.g. the account menu appears after login).
 *
 * Scope this to the desktop bar only: the mobile menu nests `<details>` inside
 * a menu `<details>`, where "close the others" would collapse the whole menu.
 */
export function NavAutoClose({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const details = () => Array.from(root.querySelectorAll("details"));

    // One open at a time: when a dropdown opens, close every other one.
    const onToggle = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLDetailsElement) || !t.open) return;
      for (const d of details()) if (d !== t) d.open = false;
    };

    // Click-away: close any open dropdown the click landed outside of.
    const onDocPointer = (e: Event) => {
      const target = e.target as Node;
      for (const d of details()) if (d.open && !d.contains(target)) d.open = false;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") for (const d of details()) d.open = false;
    };

    root.addEventListener("toggle", onToggle, true); // capture — `toggle` doesn't bubble
    document.addEventListener("click", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("toggle", onToggle, true);
      document.removeEventListener("click", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
