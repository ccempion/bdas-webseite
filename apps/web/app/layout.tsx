import type { ReactNode } from "react";
import type { Metadata } from "next";

import { isFlagOn } from "@bdas/feature-flags";

import { CookieNotice } from "../components/CookieNotice";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { PublicHeader } from "./_public/PublicHeader";
import { legalUrls } from "../lib/legal";

import "./globals.css";

// SiteHeader reads the per-request session cookie + DB to reflect login state, so
// the root layout must render at request time. Mirrors apps/web/app/account/layout.tsx:
// static prerender constructs core/db with no DATABASE_URL and fails the web build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "BDAS",
    template: "%s · BDAS",
  },
  description: "Bund der Alevitischen Studierenden — digitale Plattform.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const { privacy, imprint } = legalUrls();
  return (
    <html lang="de">
      <body className="flex min-h-screen flex-col antialiased">
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
        <SiteFooter privacyUrl={privacy} imprintUrl={imprint} />
        <CookieNotice privacyUrl={privacy} />
      </body>
    </html>
  );
}
