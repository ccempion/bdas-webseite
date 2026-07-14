import type { Metadata } from "next";

import { requirePublicShellFlag } from "../../_public/flag";

export const metadata: Metadata = {
  title: "Bund der Alevitischen Jugendlichen (BDAJ)",
  description: "Unser Jugendverband: der Bund der Alevitischen Jugendlichen in Deutschland e.V.",
};

export default function BdajPage() {
  requirePublicShellFlag();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold text-bdas-ink">
        Bund der Alevitischen Jugendlichen (BDAJ)
      </h1>
      {/* Platzhaltertext — finale Texte liefert der Bundesvorstand (Spec §8). */}
      <p className="text-bdas-ink-body">
        Der BDAJ ist die Jugendorganisation der Alevitischen Gemeinde Deutschland und vertritt über
        78.000 Kinder, Jugendliche und junge Erwachsene. Der BDAS ist eng mit dem BDAJ verbunden —
        viele unserer Mitglieder sind dort groß geworden.
      </p>
      <p>
        <a
          href="https://bdaj.de"
          rel="noopener noreferrer"
          target="_blank"
          className="text-bdas-red hover:underline"
        >
          Zur Website des BDAJ →
        </a>
      </p>
    </main>
  );
}
