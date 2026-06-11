"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { Scope } from "@bdas/dashboard-shell";

function scopeHref(s: Scope): string {
  return s.kind === "federal" ? "/federal/overview" : `/gruppe/${s.slug}/overview`;
}
function scopeLabel(s: Scope): string {
  return s.kind === "federal" ? "Bundesverband" : s.name;
}

/** Top-of-sidebar dropdown. Selecting a scope navigates to that scope's
 *  overview; the sidebar re-renders server-side with the new nav. */
export function ScopeSwitcher({ scopes, activeLabel }: { scopes: Scope[]; activeLabel: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  if (scopes.length <= 1) {
    return (
      <div className="rounded-bdas-pill border border-bdas-soft bg-bdas-surface px-4 py-2 text-bdas-pill font-semibold text-bdas-ink">
        {activeLabel}
      </div>
    );
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-bdas-pill border border-bdas-soft bg-bdas-surface px-4 py-2 text-bdas-pill font-semibold text-bdas-ink transition-colors hover:bg-bdas-surface-hover"
      >
        <span>{activeLabel}</span>
        <span className="text-bdas-ink-muted">▾</span>
      </button>
      {open && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-dropdown">
          {scopes.map((s) => (
            <li key={s.kind === "federal" ? "federal" : s.slug}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(scopeHref(s));
                }}
                className="block w-full px-4 py-2 text-left text-bdas-dropdown-link text-bdas-ink-body transition-colors hover:bg-bdas-surface-hover"
              >
                {scopeLabel(s)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
