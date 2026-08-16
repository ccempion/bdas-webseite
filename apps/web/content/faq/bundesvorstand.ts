import type { FaqSection } from "./types";

/** Federation-wide capabilities under /federal/*, for the federal board only. */
export const bundesvorstand: FaqSection = {
  key: "bundesvorstand",
  title: "Bundesvorstand",
  intro:
    "Föderationsweite Funktionen unter „Bundesverband“. Alle Zahlen und Tabellen umfassen sämtliche Gruppen.",
  visibleTo: ["federal_board"],
  entries: [
    {
      id: "overview",
      question: "Was zeigt mir die Übersicht?",
      body: [
        {
          kind: "p",
          text: "Die Übersicht zeigt die föderationsweiten Kennzahlen: aktive Mitglieder, Neuanmeldungen der letzten 30 Tage, Anzahl aktiver Gruppen und anstehende Veranstaltungen — dazu einen Verlaufs-Chart der Anmeldungen.",
        },
        { kind: "link", href: "/federal/overview", label: "Zur Übersicht" },
      ],
    },
    {
      id: "mitglieder-events-gruppen",
      question: "Wie sehe ich alle Mitglieder, Events und Gruppen?",
      body: [
        {
          kind: "p",
          text: "Die Mitgliedertabelle listet alle Mitglieder der Föderation, filterbar nach Gruppe und Status. Analog gibt es eine Tabelle aller Veranstaltungen und die Gruppen-Registry mit allen Status, inklusive ruhender und archivierter Gruppen.",
        },
        { kind: "link", href: "/federal/members", label: "Alle Mitglieder" },
        { kind: "link", href: "/federal/groups", label: "Gruppen verwalten" },
      ],
    },
    {
      id: "gruppen-verwalten",
      question: "Wie lege ich eine Gruppe an oder archiviere sie?",
      body: [
        {
          kind: "steps",
          items: [
            "„Gruppen“ im Bundesverband-Bereich öffnen.",
            "Neue Gruppe anlegen oder eine bestehende bearbeiten bzw. archivieren.",
            "Archivierte Gruppen verwaltet nur noch der Bundesvorstand — ein lokaler Vorstand kann sie nicht mehr bearbeiten.",
          ],
        },
        { kind: "link", href: "/federal/groups", label: "Zur Gruppen-Registry" },
      ],
    },
    {
      id: "rollenvergabe",
      question: "Wie vergebe ich Vorstandsrollen?",
      body: [
        {
          kind: "p",
          text: "Unter „Rollen“ im Bundesverband-Bereich vergibst und entziehst du direkt zwei Rollen: Bundesvorstand und LEAD einer Gruppe. Die übrigen lokalen Rollen — Vorstand, Event Organisator, Seiten Editor — vergibt die LEAD-Person auf der Vorstandsseite der jeweiligen Gruppe; als Bundesvorstand kannst du das dort ebenfalls erledigen.",
        },
        {
          kind: "p",
          text: "Jede Vergabe und jeder Entzug erscheint im Audit-Log.",
        },
        { kind: "link", href: "/federal/roles", label: "Zur Rollenvergabe" },
      ],
    },
    {
      id: "pool",
      question: "Was ist der „Ohne Gruppe“-Bereich?",
      body: [
        {
          kind: "p",
          text: "Hier siehst du Mitglieder ohne Gruppenzuordnung sowie jede föderationsweit offene Bewerbung — auch für Gruppen ohne aktiven Vorstand, wo sonst niemand entscheiden könnte.",
        },
        { kind: "link", href: "/federal/pool", label: "Zum Pool" },
      ],
    },
    {
      id: "dateien",
      question: "Wo sehe ich alle Dateien?",
      body: [
        {
          kind: "p",
          text: "Im Datei-Bereich hast du als einzige Rolle Zugriff auf die Ordner jeder Gruppe sowie auf den föderationsweiten Bundesvorstands-Ordner.",
        },
        { kind: "link", href: "/federal/files", label: "Zu allen Dateien" },
      ],
    },
    {
      id: "blog-moderation",
      question: "Wie moderiere ich gemeldete Blog-Beiträge?",
      body: [
        {
          kind: "p",
          text: "Gemeldete Beiträge landen in der Meldungs-Queue — nur für den Bundesvorstand sichtbar. Du kannst dort einen Beitrag bearbeiten oder löschen, oder die Meldung verwerfen. Beiträge mit Sichtbarkeit „Nur Vorstände“ sind ebenfalls nur für den Bundesvorstand lesbar.",
        },
        { kind: "link", href: "/blog/meldungen", label: "Zur Meldungs-Queue" },
      ],
    },
  ],
};
