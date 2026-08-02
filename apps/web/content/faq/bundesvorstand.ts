import type { FaqSection } from "./types";

/** Federation-wide capabilities under /federal/*, for the federal board only. */
export const bundesvorstand: FaqSection = {
  key: "bundesvorstand",
  title: "Bundesvorstand",
  intro:
    "Föderationsweite Funktionen unter „Bundesverband“. Alle Zahlen und Tabellen umfassen sämtliche Gruppen.",
  entries: [
    {
      id: "overview",
      question: "Was zeigt mir die Übersicht?",
      body: [
        {
          kind: "p",
          text: "Die Übersicht bündelt die föderationsweiten Kennzahlen: aktive und zahlende Mitglieder, Jahresbeiträge, Spenden im laufenden Jahr, Neuanmeldungen der letzten 7 und 30 Tage, kommende Veranstaltungen und Gruppen nach Status — dazu Verlaufs-Charts.",
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
          text: "Die Mitgliedertabelle listet alle Mitglieder der Föderation und lässt sich nach Gruppe, Status, Rolle und Zahlungsstatus filtern. Analog gibt es eine Tabelle aller Veranstaltungen und die Gruppen-Registry.",
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
            "Archivierte Gruppen werden nur vom Bundesvorstand verwaltet — ein lokaler Vorstand kann sie nicht mehr bearbeiten.",
          ],
        },
        { kind: "link", href: "/federal/groups", label: "Zur Gruppen-Registry" },
      ],
    },
    {
      id: "rollenvergabe",
      question: "Wie vergebe ich Vorstands- oder Bundesvorstandsrollen?",
      body: [
        {
          kind: "steps",
          items: [
            "„Rollen“ im Bundesverband-Bereich öffnen.",
            "Mitglied suchen.",
            "Rolle „Lokaler Vorstand“ (für eine Gruppe) oder „Bundesvorstand“ vergeben bzw. entziehen.",
            "Jede Vergabe und jeder Entzug erscheint im Audit-Log.",
          ],
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
          text: "Hier siehst du Mitglieder ohne Gruppenzuordnung sowie offene Gruppenwechsel-Anträge und kannst sie einer Gruppe zuweisen.",
        },
        { kind: "link", href: "/federal/pool", label: "Zum Pool" },
      ],
    },
    {
      id: "broadcasts",
      question: "Wie schreibe ich alle Mitglieder an?",
      body: [
        {
          kind: "p",
          text: "Über die föderationsweiten Broadcasts verschickst du eine E-Mail an alle Mitglieder oder an eine gefilterte Teilmenge (nach Gruppe, Rolle oder Status).",
        },
        { kind: "link", href: "/federal/broadcasts", label: "Zu den Broadcasts" },
      ],
    },
    {
      id: "payments-files",
      question: "Wo sehe ich Finanzen und alle Dateien?",
      body: [
        {
          kind: "p",
          text: "Der Payments-Bereich zeigt Spenden im Jahresverlauf, Mitgliedsbeiträge und Beitrittsgebühren-Einnahmen. Im Datei-Bereich hast du Zugriff auf alle Ordner inklusive der Zugriffslogs.",
        },
        { kind: "link", href: "/federal/payments", label: "Zu den Finanzen" },
        { kind: "link", href: "/federal/files", label: "Zu allen Dateien" },
      ],
    },
  ],
};
