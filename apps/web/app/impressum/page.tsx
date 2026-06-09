import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Impressum",
};

/**
 * Impressum — hosted in-app (ADR 0009). The legal wording is owned by the
 * federation (e.V.); the placeholder below MUST be replaced with the reviewed
 * Impressum (§ 5 DDG / § 18 MStV) before production launch.
 */
export default function ImpressumPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold text-bdas-ink">Impressum</h1>

      <div className="rounded-bdas border border-bdas-soft bg-bdas-overlay-hover px-4 py-3 text-sm text-bdas-ink-muted">
        Platzhalter — die Angaben nach § 5 DDG / § 18 MStV werden vom Bundesvorstand (e.&nbsp;V.)
        bereitgestellt und müssen vor dem Produktivstart hier eingesetzt werden.
      </div>

      <div className="flex flex-col gap-4 text-bdas-ink-body">
        <p>
          Hier sind Name und Anschrift des Vereins, die Vertretungsberechtigten, das Vereinsregister
          und die Registernummer, Kontaktdaten (E-Mail, ggf. Telefon) sowie ggf. die
          Umsatzsteuer-Identifikationsnummer einzufügen.
        </p>
      </div>
    </main>
  );
}
