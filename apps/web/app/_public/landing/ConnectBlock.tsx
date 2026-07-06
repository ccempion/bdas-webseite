import Link from "next/link";

import { Card, Section } from "@bdas/design-system";

const FEATURES = [
  { title: "Events & Anmeldung", text: "Veranstaltungen entdecken und mit einem Klick anmelden." },
  {
    title: "Dateien & Vorlagen",
    text: "Gemeinsame Dokumente, Vorlagen und Materialien an einem Ort.",
  },
  { title: "Dein Netzwerk", text: "Deine Gruppe, deine Leute — bundesweit verbunden." },
] as const;

export function ConnectBlock({ loggedIn }: { loggedIn: boolean }) {
  return (
    <Section title="BDAS-Connect" intro="Die Plattform für Mitglieder.">
      <div className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="p-4">
            <h3 className="font-semibold text-bdas-ink">{f.title}</h3>
            <p className="text-sm text-bdas-ink-body">{f.text}</p>
          </Card>
        ))}
      </div>
      <div className="mt-6">
        <Link
          href={loggedIn ? "/account" : "/registrieren"}
          className="inline-flex items-center rounded-bdas bg-bdas-red px-5 py-2.5 font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:brightness-110"
        >
          {loggedIn ? "Zu deinem Bereich" : "Jetzt registrieren"}
        </Link>
      </div>
    </Section>
  );
}
