import Link from "next/link";

import type { Scope } from "@bdas/dashboard-shell";

import { ScopeSwitcher } from "./ScopeSwitcher";
import { FEDERAL_NAV, groupNav, type NavItem } from "./nav";

function navFor(active: Scope): ReadonlyArray<NavItem> {
  return active.kind === "federal" ? FEDERAL_NAV : groupNav(active.slug);
}
function labelFor(active: Scope): string {
  return active.kind === "federal" ? "Bundesverband" : active.name;
}

/** Sidebar: scope switcher on top, then the active scope's nav. `activePath`
 *  is the current pathname so the active item gets the brand-red treatment. */
export function Sidebar({
  scopes,
  active,
  activePath,
}: {
  scopes: Scope[];
  active: Scope;
  activePath: string;
}) {
  const items = navFor(active);
  return (
    <nav className="flex w-60 shrink-0 flex-col gap-1 border-r border-bdas-soft bg-bdas-surface p-3">
      <div className="mb-2">
        <ScopeSwitcher scopes={scopes} activeLabel={labelFor(active)} />
      </div>
      {items.map((item) => {
        const isActive = activePath === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive
                ? "rounded-bdas-sm bg-bdas-surface-hover px-3 py-2 font-semibold text-bdas-red shadow-[inset_2px_0_0_var(--bdas-accent,#d12020)]"
                : "rounded-bdas-sm px-3 py-2 text-bdas-ink-body transition-colors hover:bg-bdas-surface-hover"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
