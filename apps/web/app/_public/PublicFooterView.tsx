import Image from "next/image";
import Link from "next/link";
import React from "react";

import logo from "../../public/bdas-logo.png";
import instagramLogo from "../../public/instagram-logo.png";
import linkedinLogo from "../../public/linkedin-logo.png";

const LINK = "hover:text-bdas-red hover:underline";

const SOCIAL_LINK =
  "inline-flex rounded-bdas-sm transition duration-bdas-soft ease-bdas hover:-translate-y-bdas-lift-sm hover:shadow-bdas-lift-sm";

const SOCIALS = [
  {
    name: "Instagram",
    href: "https://www.instagram.com/bdas_deutschland/",
    logo: instagramLogo,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/showcase/bund-der-alevitischen-studierenden-in-deutschland/about/",
    logo: linkedinLogo,
  },
] as const;

/** Pure footer markup. The two flag reads live in `PublicFooter`, so this
 *  renders unchanged inside the Puck canvas, which has no server context. */
export function PublicFooterView({
  privacyUrl,
  imprintUrl,
  termsUrl,
  showEvents,
  showGroups,
  showFaq,
}: {
  privacyUrl: string;
  imprintUrl: string;
  termsUrl: string;
  showEvents: boolean;
  showGroups: boolean;
  showFaq: boolean;
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
          <h2 className="mt-2 font-semibold text-bdas-ink">Folgt uns</h2>
          <ul aria-label="Social Media" className="flex items-center gap-3">
            {SOCIALS.map((social) => (
              <li key={social.name}>
                <a
                  href={social.href}
                  rel="noopener noreferrer"
                  target="_blank"
                  className={SOCIAL_LINK}
                >
                  <Image src={social.logo} alt={social.name} className="h-7 w-7" />
                </a>
              </li>
            ))}
          </ul>
        </div>
        <nav aria-label="Seiten" className="flex flex-col gap-2">
          <h2 className="font-semibold text-bdas-ink">Seiten</h2>
          <Link href="/ueber-uns" className={LINK}>
            Über uns
          </Link>
          <Link href="/unsere-arbeit" className={LINK}>
            Unsere Arbeit
          </Link>
          {showEvents && (
            <Link href="/events" className={LINK}>
              Events
            </Link>
          )}
          {showGroups && (
            <Link href="/gruppen" className={LINK}>
              Gruppen
            </Link>
          )}
          {showFaq && (
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
        <nav aria-label="Rechtliches" className="flex flex-col gap-2">
          <h2 className="font-semibold text-bdas-ink">Rechtliches</h2>
          <Link href={privacyUrl} className={LINK}>
            Datenschutz
          </Link>
          <Link href={imprintUrl} className={LINK}>
            Impressum
          </Link>
          <Link href={termsUrl} className={LINK}>
            Nutzungsbedingungen
          </Link>
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
