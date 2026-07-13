import Image from "next/image";
import Link from "next/link";

import logo from "../public/bdas-logo.png";

/**
 * Site footer landmark. Carries the legal links (Datenschutzerklärung +
 * Impressum), which are in-app routes (ADR 0009).
 */
export function SiteFooter({ privacyUrl, imprintUrl }: { privacyUrl: string; imprintUrl: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-bdas-soft bg-bdas-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-bdas-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          <Image src={logo} alt="" className="h-7 w-auto" />© {year} Bund der Alevitischen
          Studierenden
        </p>
        <nav aria-label="Rechtliches" className="flex items-center gap-4">
          <Link href={privacyUrl} className="hover:text-bdas-red hover:underline">
            Datenschutz
          </Link>
          <Link href={imprintUrl} className="hover:text-bdas-red hover:underline">
            Impressum
          </Link>
        </nav>
      </div>
    </footer>
  );
}
