import type { Metadata } from "next";

import { requirePublicShellFlag } from "../../_public/flag";

export const metadata: Metadata = {
  title: "Verbandsstruktur",
  description: "Wie der BDAS organisiert ist: Hochschulgruppen, Bundesvorstand, Bundeskonferenz.",
};

export default function VerbandsstrukturPage() {
  requirePublicShellFlag();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold text-bdas-ink">Verbandsstruktur</h1>
      {/* Platzhaltertext — finale Texte liefert der Bundesvorstand (Spec §8). */}
      <p className="text-bdas-ink-body">
        Der BDAS besteht aus lokalen Hochschulgruppen, die von gewählten lokalen Vorständen geleitet
        werden. Auf Bundesebene koordiniert der Bundesvorstand die gemeinsame Arbeit; die
        Bundeskonferenz ist das höchste beschlussfassende Gremium.
      </p>
    </main>
  );
}
