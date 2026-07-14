/**
 * Top-of-page nav for the standalone dashboard. A small static set of in-app
 * links; the visual idiom is the desktop nav-pill from core/design-system
 * tokens. Module links only appear when their feature flag is enabled.
 */
import Link from "next/link";

import { getCurrentUser } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";

import { readSessionCookie } from "../lib/auth-cookie";
import { BrandLink } from "./BrandLink";

const PILL =
  "inline-flex items-center rounded-bdas-pill px-3 py-1 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover";

export async function SiteHeader() {
  const groupsOn = isFlagOn("groups");
  const eventsOn = isFlagOn("events");
  const me = isFlagOn("auth") ? await getCurrentUser(getDb(), readSessionCookie()) : null;

  return (
    <header className="border-b border-bdas-soft bg-bdas-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <BrandLink />
        <nav aria-label="Hauptnavigation" className="flex flex-1 items-center justify-end">
          <ul className="flex flex-wrap items-center gap-1">
            {groupsOn ? (
              <li>
                <Link href="/gruppen" className={PILL}>
                  Gruppen
                </Link>
              </li>
            ) : null}
            {eventsOn ? (
              <li>
                <Link href="/events" className={PILL}>
                  Veranstaltungen
                </Link>
              </li>
            ) : null}
            {me ? (
              <>
                <li>
                  <Link href="/account" className={PILL}>
                    Mein Konto
                  </Link>
                </li>
                <li>
                  <form action="/abmelden" method="post">
                    <button type="submit" className={PILL}>
                      Abmelden
                    </button>
                  </form>
                </li>
              </>
            ) : (
              <li>
                <Link href="/anmelden" className={PILL}>
                  Anmelden
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
