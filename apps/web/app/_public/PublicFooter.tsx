import Image from "next/image";
import Link from "next/link";

import { isFlagOn } from "@bdas/feature-flags";

import { faqEnabled } from "../../lib/faq/enabled";
import logo from "../../public/bdas-logo.png";

const LINK = "hover:text-bdas-red hover:underline";

/** Public-site footer: contact, quick links, partner orgs, legal, socials.
 *  Contact details and social handles are placeholders (spec §8 open items). */
export function PublicFooter({
  privacyUrl,
  imprintUrl,
}: {
  privacyUrl: string;
  imprintUrl: string;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-bdas-soft bg-bdas-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-bdas-ink-body sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Image src={logo} alt="BDAS" className="mb-1 h-12 w-auto self-start" />
          <h2 className="font-semibold text-bdas-ink">Kontakt</h2>
          <p>Bund der Alevitischen Studierenden in Deutschland</p>
          <p>
            <a href="mailto:info@bdas.de" className={LINK}>
              info@bdas.de
            </a>
          </p>
        </div>
        <nav aria-label="Seiten" className="flex flex-col gap-2">
          <h2 className="font-semibold text-bdas-ink">Seiten</h2>
          <Link href="/ueber-uns" className={LINK}>
            Über uns
          </Link>
          <Link href="/unsere-arbeit" className={LINK}>
            Unsere Arbeit
          </Link>
          {isFlagOn("events") && (
            <Link href="/events" className={LINK}>
              Events
            </Link>
          )}
          {isFlagOn("groups") && (
            <Link href="/gruppen" className={LINK}>
              Gruppen
            </Link>
          )}
          {faqEnabled() && (
            <Link href="/faq" className={LINK}>
              FAQ &amp; Hilfe
            </Link>
          )}
        </nav>
        <nav aria-label="Partner" className="flex flex-col gap-2">
          <h2 className="font-semibold text-bdas-ink">Verbund</h2>
          <a href="https://bdaj.de" rel="noopener noreferrer" target="_blank" className={LINK}>
            BDAJ — Bund der Alevitischen Jugendlichen
          </a>
          <a href="https://alevi.com" rel="noopener noreferrer" target="_blank" className={LINK}>
            AABF — Alevitische Gemeinde Deutschland
          </a>
        </nav>
        <nav aria-label="Rechtliches und Social Media" className="flex flex-col gap-2">
          <h2 className="font-semibold text-bdas-ink">Rechtliches</h2>
          <Link href={privacyUrl} className={LINK}>
            Datenschutz
          </Link>
          <Link href={imprintUrl} className={LINK}>
            Impressum
          </Link>
          <a
            href="https://www.instagram.com/"
            rel="noopener noreferrer"
            target="_blank"
            className={LINK}
          >
            Instagram
          </a>
        </nav>
      </div>
      <div className="border-t border-bdas-soft">
        <p className="mx-auto max-w-6xl px-4 py-4 text-sm text-bdas-ink-muted">
          © {year} Bund der Alevitischen Studierenden
        </p>
      </div>
    </footer>
  );
}
