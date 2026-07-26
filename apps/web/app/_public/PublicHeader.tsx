import Link from "next/link";

import { canAdministerBoard } from "@bdas/dashboard-shell";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroup } from "@bdas/groups";

import { BrandLink } from "../../components/BrandLink";
import { loadCurrentMember } from "../_dashboard/session";
import { MobileMenuAutoClose } from "./MobileMenuAutoClose";
import { NavAutoClose } from "./NavAutoClose";
import { navItems, type NavItem } from "./nav-items";

const PILL =
  "inline-flex items-center rounded-bdas-pill px-3 py-1.5 text-bdas-pill text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover";
// `active:` alongside `hover:` so a touch device, which never hovers, still
// answers the tap on the entry that was actually pressed.
const DROPDOWN_LINK =
  "block rounded-bdas-sm px-3 py-2 text-bdas-dropdown-link text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover active:bg-bdas-surface-hover";

function DesktopItem({ item }: { item: NavItem }) {
  if ("href" in item) {
    return (
      <Link href={item.href} className={PILL}>
        {item.label}
      </Link>
    );
  }
  return (
    <details className="group relative">
      <summary className={`${PILL} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        {item.label}
        <span
          aria-hidden
          className="ml-1 text-bdas-ink-muted transition-transform duration-bdas-quick group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <ul className="absolute left-0 top-full z-40 mt-2 w-72 animate-bdas-fade-slide-down rounded-bdas border border-bdas-strong bg-bdas-surface p-2 shadow-bdas-dropdown">
        {item.children.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className={DROPDOWN_LINK}>
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export async function PublicHeader() {
  const me = await loadCurrentMember();
  const isBoard = me ? canAdministerBoard(me.grants) : false;

  // "Meine Gruppe" links into the public group page; it needs the group's slug
  // and only makes sense while groups are enabled and the group is not archived
  // (its public page 404s otherwise).
  const groupId = me?.member?.primaryGroupId ?? null;
  const group = groupId && isFlagOn("groups") ? await getGroup(getDb(), groupId) : null;
  const myGroup =
    group && group.status !== "archived" ? { slug: group.slug, name: group.name } : undefined;

  // Files access is per member-kind, independent of the group page; flag-gate it
  // so the item never renders while BDAS_FLAG_FILES is off (no dead link).
  const showFiles = Boolean(me?.member) && isFlagOn("files");

  const items = navItems({
    isLoggedIn: Boolean(me),
    ...(myGroup ? { myGroup } : {}),
    showFiles,
  });
  const displayName = me?.member?.firstName ?? "Konto";

  return (
    <header className="sticky top-0 z-50 border-b border-bdas-soft bg-bdas-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <BrandLink />

        {/* Desktop nav */}
        <nav
          aria-label="Hauptnavigation"
          className="hidden flex-1 items-center justify-end md:flex"
        >
          <NavAutoClose>
            <ul className="flex items-center gap-1">
              {items.map((item) => (
                <li key={item.label}>
                  <DesktopItem item={item} />
                </li>
              ))}
              {me ? (
                <li>
                  <details className="group relative">
                    <summary
                      className={`${PILL} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
                    >
                      {displayName}
                      <span
                        aria-hidden
                        className="ml-1 text-bdas-ink-muted transition-transform duration-bdas-quick group-open:rotate-180"
                      >
                        ▾
                      </span>
                    </summary>
                    <ul className="absolute right-0 top-full z-40 mt-2 w-56 animate-bdas-fade-slide-down rounded-bdas border border-bdas-strong bg-bdas-surface p-2 shadow-bdas-dropdown">
                      <li>
                        <Link href="/account" className={DROPDOWN_LINK}>
                          Mein Konto
                        </Link>
                      </li>
                      {isBoard ? (
                        <li>
                          <Link href="/dashboard" className={DROPDOWN_LINK}>
                            Board-Bereich
                          </Link>
                        </li>
                      ) : null}
                      <li>
                        <form action="/abmelden" method="post">
                          <button type="submit" className={`${DROPDOWN_LINK} w-full text-left`}>
                            Abmelden
                          </button>
                        </form>
                      </li>
                    </ul>
                  </details>
                </li>
              ) : (
                <>
                  <li>
                    <Link
                      href="/registrieren"
                      className="inline-flex items-center rounded-bdas-pill bg-bdas-red px-4 py-1.5 text-bdas-pill font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:brightness-110"
                    >
                      Mitglied werden
                    </Link>
                  </li>
                  <li>
                    <Link href="/anmelden" className={PILL}>
                      Anmelden
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </NavAutoClose>
        </nav>

        {/* Mobile menu */}
        <MobileMenuAutoClose>
          <details className="ml-auto md:hidden">
            <summary
              aria-label="Menü öffnen"
              className="cursor-pointer list-none rounded-bdas border border-bdas-strong px-3 py-1.5 text-bdas-ink [&::-webkit-details-marker]:hidden"
            >
              Menü
            </summary>
            <nav
              aria-label="Hauptnavigation mobil"
              className="absolute inset-x-0 top-full z-40 border-b border-bdas-soft bg-bdas-surface px-4 py-4 shadow-bdas-dropdown"
            >
              <ul className="flex flex-col gap-1">
                {items.map((item) =>
                  "href" in item ? (
                    <li key={item.label}>
                      <Link href={item.href} className={DROPDOWN_LINK}>
                        {item.label}
                      </Link>
                    </li>
                  ) : (
                    <li key={item.label}>
                      <details>
                        <summary
                          className={`${DROPDOWN_LINK} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
                        >
                          {item.label}
                        </summary>
                        {/* Grouped by indent and a hairline rather than a fill:
                            a filled panel reads as "all four are selected",
                            which is the one thing the pressed state has to say. */}
                        <ul className="ml-3 flex flex-col gap-1 border-l border-bdas-soft py-1 pl-2">
                          {item.children.map((c) => (
                            <li key={c.href}>
                              <Link href={c.href} className={DROPDOWN_LINK}>
                                {c.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ),
                )}
                {me ? (
                  <>
                    <li>
                      <Link href="/account" className={DROPDOWN_LINK}>
                        Mein Konto
                      </Link>
                    </li>
                    {isBoard ? (
                      <li>
                        <Link href="/dashboard" className={DROPDOWN_LINK}>
                          Board-Bereich
                        </Link>
                      </li>
                    ) : null}
                    <li>
                      <form action="/abmelden" method="post">
                        <button type="submit" className={`${DROPDOWN_LINK} w-full text-left`}>
                          Abmelden
                        </button>
                      </form>
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <Link
                        href="/registrieren"
                        className="mt-2 inline-flex items-center rounded-bdas-pill bg-bdas-red px-4 py-2 font-medium text-white"
                      >
                        Mitglied werden
                      </Link>
                    </li>
                    <li>
                      <Link href="/anmelden" className={DROPDOWN_LINK}>
                        Anmelden
                      </Link>
                    </li>
                  </>
                )}
              </ul>
            </nav>
          </details>
        </MobileMenuAutoClose>
      </div>
    </header>
  );
}
