import type { FaqSection } from "./types";

/**
 * Local-board capabilities under /gruppe/[slug]/*, split by sub-role. Subgroup
 * `id`s are the role-grant strings (local_board, local_board_lead,
 * event_organizer, page_editor) so the renderer can highlight the viewer's own
 * sub-role from their grants.
 */
export const vorstand: FaqSection = {
  key: "vorstand",
  title: "Vorstand",
  intro:
    "Funktionen für den lokalen Vorstand, jeweils auf die eigene Gruppe begrenzt — getrennt nach den vier Vorstandsrollen.",
  visibleTo: ["local_board", "local_board_lead", "event_organizer", "page_editor"],
  entries: [],
  subgroups: [
    {
      id: "local_board",
      title: "Vorstand",
      // LEAD is a functional superset of local_board (roles.ts: canManageGroup
      // treats both identically) and a LEAD grant is often held on its own,
      // without a separate plain local_board row — so the baseline how-to
      // content stays visible to a LEAD too, not just the narrower LEAD-only
      // extras below.
      visibleTo: ["local_board", "local_board_lead"],
      entries: [
        {
          id: "lb-uebersicht-roster",
          question: "Was kann ich als Vorstand verwalten?",
          body: [
            {
              kind: "p",
              text: "Du siehst die Übersicht deiner Gruppe (Kennzahlen und Verlaufs-Chart) und verwaltest den Mitgliederbestand: Beitrittsanfragen und eingehende Gruppenwechsel per Klick annehmen oder ablehnen.",
            },
            {
              kind: "steps",
              items: [
                "Im Dashboard in den Bereich deiner Gruppe wechseln.",
                "„Mitglieder“ öffnen für den Bestand, „Bewerbungen“ für offene Anfragen.",
              ],
            },
            { kind: "link", href: "/dashboard", label: "Zum Gruppen-Dashboard" },
          ],
        },
        {
          id: "lb-events",
          question: "Wie lege ich eine Veranstaltung an?",
          body: [
            {
              kind: "steps",
              items: [
                "Im Gruppenbereich „Events“ öffnen.",
                "Neue Veranstaltung erstellen: Titel, Datum, Ort und Plätze festlegen.",
                "Speichern — Mitglieder können sich anschließend an- und abmelden; volle Events führen eine Warteliste.",
              ],
            },
          ],
        },
        {
          id: "lb-profil-vs-seite",
          question: "Wo bearbeite ich das Gruppenprofil — und wo die Gruppenseite?",
          body: [
            {
              kind: "p",
              text: "Das sind zwei verschiedene Dinge. Das Gruppenprofil — Name, Stadt, Standort auf der Karte — bearbeitest du als jeder Vorstand unter „Profil“. Die öffentliche Gruppenseite (Inhalte, Text, Bilder) darf nur die LEAD-Person oder ein Seiten Editor bearbeiten.",
            },
          ],
        },
        {
          id: "lb-dateien",
          question: "Wo finde ich meine Gruppendateien?",
          body: [
            {
              kind: "p",
              text: "Im Datei-Bereich deiner Gruppe hast du Zugriff auf den Mitglieder-Ordner und den Vorstands-Ordner deiner Gruppe.",
            },
          ],
        },
        {
          id: "lb-grenzen",
          question: "Was kann ich als Vorstand NICHT?",
          body: [
            {
              kind: "p",
              text: "Ein einfacher Vorstand kann weder die öffentliche Gruppenseite bearbeiten noch Rollen vergeben. Beides ist der LEAD-Rolle vorbehalten — die es wiederum an Seiten Editor bzw. Event Organisator delegieren kann.",
            },
          ],
        },
      ],
    },
    {
      id: "local_board_lead",
      title: "LEAD",
      visibleTo: ["local_board_lead"],
      entries: [
        {
          id: "lead-was-zusaetzlich",
          question: "Was kann ich als LEAD zusätzlich zum Vorstand?",
          body: [
            {
              kind: "p",
              text: "LEAD ist die höchste Vertrauensrolle deiner Gruppe. Zusätzlich zu allen Vorstandsrechten darfst du auf der Vorstandsseite deiner Gruppe Rollen vergeben und die öffentliche Gruppenseite bearbeiten.",
            },
            {
              kind: "steps",
              items: [
                "„Vorstand“, „Event Organisator“ oder „Seiten-Editor“ an Mitglieder deiner Gruppe vergeben oder entziehen.",
                "Die öffentliche Gruppenseite selbst bearbeiten.",
              ],
            },
          ],
        },
        {
          id: "lead-grenzen",
          question: "Wo hört die LEAD-Rolle auf?",
          body: [
            {
              kind: "p",
              text: "Archivierte Gruppen kann auch ein LEAD nicht mehr verwalten — das übernimmt der Bundesvorstand. Eine weitere LEAD-Person oder die Bundesvorstands-Rolle vergibt ebenfalls nur der Bundesvorstand.",
            },
          ],
        },
      ],
    },
    {
      id: "event_organizer",
      title: "Event Organisator",
      visibleTo: ["event_organizer"],
      entries: [
        {
          id: "eo-scope",
          question: "Was darf ich als Event Organisator?",
          body: [
            {
              kind: "p",
              text: "Du bist Delegierter für die Veranstaltungen deiner Gruppe: Events anlegen, bearbeiten und absagen — ohne den vollen Vorstandszugriff. Mitgliederverwaltung und Rollenvergabe gehören nicht dazu.",
            },
          ],
        },
      ],
    },
    {
      id: "page_editor",
      title: "Seiten Editor",
      visibleTo: ["page_editor"],
      entries: [
        {
          id: "pe-scope",
          question: "Was darf ich als Seiten Editor?",
          body: [
            {
              kind: "p",
              text: "Du darfst ausschließlich die öffentliche Seite deiner Gruppe bearbeiten — Inhalte, Text und Darstellung. Das Gruppenprofil (Name/Stadt/Standort) und weitere Vorstandsfunktionen sind mit dieser Rolle nicht verbunden.",
            },
          ],
        },
      ],
    },
  ],
};
