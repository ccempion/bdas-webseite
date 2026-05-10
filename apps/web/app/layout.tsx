import type { ReactNode } from "react";
import type { Metadata } from "next";

import { SiteHeader } from "../components/SiteHeader";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BDAS",
    template: "%s · BDAS",
  },
  description: "Bund Deutscher Alevitischer Studierender — digitale Plattform.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
