import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
};

/**
 * Datenschutzerklärung — hosted in-app (ADR 0009). The legal wording is owned
 * by the federation (e.V.); the placeholder below MUST be replaced with the
 * reviewed Datenschutzerklärung before production launch.
 */
export default function DatenschutzPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold text-bdas-ink">Datenschutzerklärung</h1>

      <div className="rounded-bdas border border-bdas-soft bg-bdas-overlay-hover px-4 py-3 text-sm text-bdas-ink-muted">
        Platzhalter — der rechtsverbindliche Text der Datenschutzerklärung wird vom Bundesvorstand
        (e.&nbsp;V.) bereitgestellt und muss vor dem Produktivstart hier eingesetzt werden.
      </div>

      <div className="flex flex-col gap-4 text-bdas-ink-body">
        <p>
          Diese Plattform setzt ausschließlich technisch notwendige Cookies ein, um angemeldete
          Mitglieder eingeloggt zu halten. Es findet kein Tracking und keine Weitergabe an Dritte zu
          Werbezwecken statt.
        </p>
        <p>
          Auf der Startseite und der Seite „Hochschulgruppen" binden wir eine interaktive Karte auf
          Basis von OpenStreetMap ein. Beim Laden der Karte wird Ihre IP-Adresse an Server der
          OpenStreetMap Foundation (St John&apos;s Innovation Centre, Cambridge, Vereinigtes
          Königreich) übertragen, um die Kartenkacheln auszuliefern. Rechtsgrundlage ist unser
          berechtigtes Interesse an einer ansprechenden Darstellung unserer Hochschulgruppen
          (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
        <p>
          Verantwortliche Stelle, Kontaktdaten, Zweck und Rechtsgrundlage der Verarbeitung, Hinweise
          zu Speicherdauer und Betroffenenrechten sind hier einzufügen.
        </p>
      </div>
    </main>
  );
}
