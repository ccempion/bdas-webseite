/**
 * Top-of-page nav. Mirrors the WP primary menu (per ADR 0004) so the
 * dashboard and bdas.de feel like one site. Links go to bdas.de pages
 * directly — the shared `.bdas.de` cookie keeps the user logged in across
 * both surfaces. The visual idiom is the desktop nav-pill from
 * core/design-system tokens.
 */
import Link from "next/link";

import { getMenu } from "@bdas/content-bridge";

export async function SiteHeader() {
  const { items } = await getMenu();
  const topLevel = items.filter((i) => i.parentId === 0);

  return (
    <header className="border-b border-bdas-soft bg-bdas-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-bdas-ink hover:text-bdas-red"
        >
          BDAS
        </Link>
        <nav aria-label="Hauptnavigation" className="flex flex-1 items-center justify-end">
          {topLevel.length === 0 ? (
            <a
              href="https://bdas.de"
              className="rounded-bdas-pill px-3 py-1 text-sm text-bdas-ink hover:bg-bdas-overlay-hover"
            >
              Zur Hauptseite
            </a>
          ) : (
            <ul className="flex flex-wrap items-center gap-1">
              {topLevel.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.url}
                    className="inline-flex items-center rounded-bdas-pill px-3 py-1 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </div>
    </header>
  );
}
