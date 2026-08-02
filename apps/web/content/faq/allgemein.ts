import type { FaqSection } from "./types";

/** Platform basics, roles, and orientation — relevant to every signed-in user. */
export const allgemein: FaqSection = {
  key: "allgemein",
  title: "Allgemein",
  intro:
    "Grundlagen der Plattform: was sie ist, wie du dich anmeldest und wie das Rollensystem funktioniert.",
  entries: [
    {
      id: "was-ist-die-plattform",
      question: "Was ist die BDAS-Plattform?",
      body: [
        {
          kind: "p",
          text: "Die Plattform ist das zentrale System des Bundes der Alevitischen Studierenden für Mitgliedschaft, Veranstaltungen und Vorstandsarbeit. Sie ersetzt die frühere Mischung aus WordPress, WhatsApp und Tabellen und ist das führende System für Mitglieder-, Event- und Gruppendaten.",
        },
        {
          kind: "p",
          text: "Sie besteht aus zwei Bereichen: dem öffentlichen Auftritt (Startseite, Veranstaltungen, Gruppen, Spenden) und dem angemeldeten Dashboard mit den internen Funktionen.",
        },
      ],
    },
    {
      id: "oeffentlich-vs-dashboard",
      question: "Was ist der Unterschied zwischen öffentlicher Seite und Dashboard?",
      body: [
        {
          kind: "p",
          text: "Der öffentliche Bereich ist für alle sichtbar und zeigt Marketing-Inhalte, die Veranstaltungsliste, die Gruppenübersicht und die Spendenseite. Das Dashboard ist der angemeldete Arbeitsbereich; was du dort siehst, hängt von deiner Rolle ab.",
        },
        { kind: "link", href: "/dashboard", label: "Zum Dashboard" },
      ],
    },
    {
      id: "registrierung-login",
      question: "Wie registriere und melde ich mich an?",
      body: [
        {
          kind: "steps",
          items: [
            "Mit E-Mail-Adresse und Passwort registrieren.",
            "Die Bestätigungs-E-Mail öffnen und den Verifizierungslink anklicken — die Verifizierung ist Pflicht, bevor Rollen vergeben werden können.",
            "Danach jederzeit über „Anmelden“ einloggen. Passwort vergessen? Über den Zurücksetzen-Link neu setzen.",
          ],
        },
        { kind: "link", href: "/anmelden", label: "Zur Anmeldung" },
      ],
    },
    {
      id: "rollenmodell",
      question: "Welche Rollen gibt es und wie funktionieren sie?",
      body: [
        {
          kind: "p",
          text: "Jede Person hat eine Basisrolle (z. B. Mitglied) und dazu beliebig viele zugewiesene Rollen, die auf eine Gruppe begrenzt sein können.",
        },
        {
          kind: "steps",
          items: [
            "Mitglied — registriertes, aktives Mitglied einer Hochschulgruppe.",
            "Vorstand (Lokaler Vorstand) — verwaltet die eigene Gruppe.",
            "LEAD — höchste Vertrauensrolle einer Gruppe; darf Rollen in der Gruppe vergeben.",
            "Event Organisator — darf Veranstaltungen der Gruppe verwalten.",
            "Seiten Editor — darf die öffentliche Gruppenseite bearbeiten.",
            "Bundesvorstand — föderationsweite Verwaltung über alle Gruppen.",
            "Alumni — ausgeschiedenes Mitglied mit eingeschränktem Lesezugriff.",
          ],
        },
      ],
    },
    {
      id: "scope-switcher",
      question: "Ich habe mehrere Rollen — wie wechsle ich zwischen ihnen?",
      body: [
        {
          kind: "p",
          text: "Wer mehrere Zuständigkeiten hat (z. B. LEAD einer Gruppe und Bundesvorstand), wechselt oben in der Seitenleiste des Dashboards über den Bereichs-Umschalter zwischen den Ansichten — die URL musst du dafür nicht wechseln.",
        },
      ],
    },
    {
      id: "zugriff-sicherheit",
      question: "Wer darf was sehen?",
      body: [
        {
          kind: "p",
          text: "Jede Dashboard-Seite ist an deine Rolle gebunden. Ohne passende Zuweisung wirst du automatisch zurück auf deinen erlaubten Bereich geleitet. So sieht niemand Daten, für die er nicht zuständig ist.",
        },
      ],
    },
    {
      id: "account-praeferenzen",
      question: "Wo ändere ich meine Kontoeinstellungen?",
      body: [
        {
          kind: "p",
          text: "Unter „Mein Konto“ verwaltest du deine Zugangsdaten und deine E-Mail-Präferenzen — also welche Benachrichtigungskategorien du erhalten möchtest. Transaktionale E-Mails (z. B. Verifizierung, Anmeldebestätigungen) sind verpflichtend und nicht abwählbar.",
        },
        { kind: "link", href: "/account", label: "Zu meinem Konto" },
      ],
    },
  ],
};
