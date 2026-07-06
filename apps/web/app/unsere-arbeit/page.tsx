import type { Metadata } from "next";

import { Card } from "@bdas/design-system";

import { AGS } from "../_public/ags";
import { requirePublicShellFlag } from "../_public/flag";

export const metadata: Metadata = {
  title: "Unsere Arbeit",
  description: "Die Arbeitsgruppen des BDAS: Öffentlichkeitsarbeit, Medizin, Technik, Jura.",
};

export default function UnsereArbeitPage() {
  requirePublicShellFlag();
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-bdas-ink">Unsere Arbeit</h1>
        <p className="text-bdas-ink-body">
          In Arbeitsgruppen (AGs) organisieren wir uns über Gruppengrenzen hinweg.
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {AGS.map((ag) => (
          <li key={ag.slug}>
            <Card className="h-full p-5">
              <h2 className="mb-2 text-xl font-semibold text-bdas-ink">{ag.name}</h2>
              <p className="text-bdas-ink-body">{ag.teaser}</p>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
