import type { ReactNode } from "react";
import type { Metadata } from "next";

import { isFlagOn } from "@bdas/feature-flags";

import { CookieNotice } from "../components/CookieNotice";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { PublicHeader } from "./_public/PublicHeader";
import { PublicFooter } from "./_public/PublicFooter";
import { WindowDropGuard } from "./_upload/WindowDropGuard";
import { legalUrls } from "../lib/legal";

import "./globals.css";

// SiteHeader reads the per-request session cookie + DB to reflect login state, so
// the root layout must render at request time. Mirrors apps/web/app/account/layout.tsx:
// static prerender constructs core/db with no DATABASE_URL and fails the web build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000"),
  title: {
    default: "BDAS — Bund der Alevitischen Studierenden",
    template: "%s · BDAS",
  },
  description:
    "Der Bund der Alevitischen Studierenden in Deutschland: Hochschulgruppen, Veranstaltungen und BDAS-Connect, die Plattform für Mitglieder.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const { privacy, imprint } = legalUrls();
  return (
    <html lang="de">
      <body className="flex min-h-screen flex-col antialiased">
        <WindowDropGuard />
        <a
          href="#inhalt"
          className="sr-only rounded-bdas px-4 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-bdas-surface focus:text-bdas-ink focus:shadow-bdas-card"
        >
          Zum Inhalt springen
        </a>
        {isFlagOn("public_shell") ? <PublicHeader /> : <SiteHeader />}
        <div id="inhalt" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </div>
        {isFlagOn("public_shell") ? (
          <PublicFooter privacyUrl={privacy} imprintUrl={imprint} />
        ) : (
          <SiteFooter privacyUrl={privacy} imprintUrl={imprint} />
        )}
        <CookieNotice privacyUrl={privacy} />
      </body>
    </html>
  );
}
