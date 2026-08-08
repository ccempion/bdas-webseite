"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Scope } from "@bdas/dashboard-shell";

import { ScopeSwitcher } from "./ScopeSwitcher";
import { activeScope, FEDERAL_NAV, groupNav, isNavItemActive, type NavItem } from "./nav";

function navFor(active: Scope): ReadonlyArray<NavItem> {
  return active.kind === "federal" ? FEDERAL_NAV : groupNav(active.slug);
}
function labelFor(active: Scope): string {
  return active.kind === "federal" ? "Bundesverband" : active.name;
}

/** Sidebar: scope switcher on top, then the active scope's nav. Active state is
 *  derived client-side from `usePathname()` so the highlight follows soft
 *  navigations — a server-rendered layout would freeze it at first paint. */
export function Sidebar({ scopes }: { scopes: Scope[] }) {
  const pathname = usePathname();
  const active = activeScope(scopes, pathname);
  if (!active) return null;
  const items = navFor(active);
  return (
    <nav className="flex w-full shrink-0 flex-col gap-1 border-b border-bdas-soft bg-bdas-surface p-3 md:w-60 md:border-b-0 md:border-r">
      <div className="mb-2">
        <ScopeSwitcher scopes={scopes} activeLabel={labelFor(active)} />
      </div>
      {/* Seven items stacked would push the content a screen down on a phone,
          so below `md` the nav scrolls sideways instead of growing downwards. */}
      <div className="flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-x-visible">
        {items.map((item) => {
          const isActive = isNavItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "whitespace-nowrap rounded-bdas-sm bg-bdas-surface-hover px-3 py-2 font-semibold text-bdas-red shadow-[inset_2px_0_0_var(--bdas-accent,#d12020)]"
                  : "whitespace-nowrap rounded-bdas-sm px-3 py-2 text-bdas-ink-body transition-colors hover:bg-bdas-surface-hover"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
