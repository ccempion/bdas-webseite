import type { Metadata } from "next";

import { requirePublicShellFlag } from "../_public/flag";

export const metadata: Metadata = {
  title: "Über uns",
  description:
    "Der Bund der Alevitischen Studierenden in Deutschland (BDAS) — wer wir sind und wofür wir stehen.",
};

export default function KurzportraitPage() {
  requirePublicShellFlag();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold text-bdas-ink">Über uns</h1>
      {/* Platzhaltertext — finale Texte liefert der Bundesvorstand (Spec §8). */}
      <p className="text-bdas-ink-body">
        Der Bund der Alevitischen Studierenden in Deutschland (BDAS) ist der Zusammenschluss
        alevitischer Hochschulgruppen an deutschen Universitäten. Wir vernetzen Studierende,
        organisieren Veranstaltungen und vertreten die Interessen alevitischer Studierender.
      </p>
      <p className="text-bdas-ink-body">
        Von der Erstsemester-Begrüßung bis zur Bundeskonferenz: Unsere Hochschulgruppen leben
        alevitische Werte im Studienalltag — offen, demokratisch und solidarisch.
      </p>
    </main>
  );
}
