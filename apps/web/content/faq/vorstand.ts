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
  entries: [],
  subgroups: [
    {
      id: "local_board",
      title: "Vorstand",
      entries: [
        {
          id: "lb-uebersicht-roster",
          question: "Was kann ich als Vorstand verwalten?",
          body: [
            {
              kind: "p",
              text: "Du siehst die Übersicht deiner Gruppe (Kennzahlen und Charts) und verwaltest den Mitgliederbestand: Beitrittsanfragen und eingehende Gruppenwechsel per Klick annehmen oder ablehnen.",
            },
            {
              kind: "steps",
              items: [
                "Im Dashboard in den Bereich deiner Gruppe wechseln.",
                "„Mitglieder“ öffnen: ausstehende Mitglieder und Gruppenwechsel-Anträge entscheiden.",
                "Re-Verifizierungsstatus der Mitglieder im Blick behalten.",
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
          id: "lb-join-policy",
          question: "Wie stelle ich eine Beitrittsgebühr ein?",
          body: [
            {
              kind: "p",
              text: "Über die Beitritts-Richtlinie deiner Gruppe legst du fest, ob für den Beitritt eine Gebühr fällig ist und wie hoch sie ist.",
            },
          ],
        },
        {
          id: "lb-broadcast",
          question: "Wie schreibe ich meine Gruppe an?",
          body: [
            {
              kind: "p",
              text: "Der Gruppen-Broadcast verschickt eine E-Mail an alle Mitglieder deiner Gruppe, optional gefiltert (z. B. nur für ein bestimmtes Event angemeldete). Außerhalb der eigenen Gruppe kannst du nicht senden.",
            },
          ],
        },
        {
          id: "lb-handover-projekte-dateien",
          question: "Wo finde ich Übergabe, Projekte und Dateien?",
          body: [
            {
              kind: "p",
              text: "Der Übergabe-Bereich führt Checklisten und verknüpfte Dokumente für den Vorstandswechsel. Zusätzlich verwaltest du die Projekt-Showcases deiner Gruppe und hast Zugriff auf die Gruppen- und Vorstands-Ordner im Dateibereich.",
            },
          ],
        },
        {
          id: "lb-grenzen",
          question: "Was kann ich als Vorstand NICHT?",
          body: [
            {
              kind: "p",
              text: "Ein einfacher Vorstand kann weder die öffentliche Gruppenseite bearbeiten noch Rollen vergeben. Beides ist der LEAD-Rolle vorbehalten (bzw. delegiert die LEAD-Rolle das an Seiten Editor / Event Organisator).",
            },
          ],
        },
      ],
    },
    {
      id: "local_board_lead",
      title: "LEAD",
      entries: [
        {
          id: "lead-was-zusaetzlich",
          question: "Was kann ich als LEAD zusätzlich zum Vorstand?",
          body: [
            {
              kind: "p",
              text: "LEAD ist die höchste Vertrauensrolle deiner Gruppe. Zusätzlich zu allen Vorstandsrechten darfst du Rollen innerhalb der Gruppe vergeben und die öffentliche Gruppenseite bearbeiten.",
            },
            {
              kind: "steps",
              items: [
                "„Lokaler Vorstand“ an Mitglieder deiner Gruppe vergeben oder entziehen.",
                "Delegierte ernennen: Event Organisator (Events) und Seiten Editor (Gruppenseite).",
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
              text: "Archivierte Gruppen kann auch ein LEAD nicht mehr verwalten — das übernimmt der Bundesvorstand. Bundesweite Rollen (Bundesvorstand) vergibt ebenfalls nur der Bundesvorstand.",
            },
          ],
        },
      ],
    },
    {
      id: "event_organizer",
      title: "Event Organisator",
      entries: [
        {
          id: "eo-scope",
          question: "Was darf ich als Event Organisator?",
          body: [
            {
              kind: "p",
              text: "Du bist Delegierter für die Veranstaltungen deiner Gruppe: Events anlegen und verwalten — ohne den vollen Vorstandszugriff. Mitgliederverwaltung, Rollenvergabe und Beitritts-Richtlinie gehören nicht dazu.",
            },
          ],
        },
      ],
    },
    {
      id: "page_editor",
      title: "Seiten Editor",
      entries: [
        {
          id: "pe-scope",
          question: "Was darf ich als Seiten Editor?",
          body: [
            {
              kind: "p",
              text: "Du darfst ausschließlich die öffentliche Seite deiner Gruppe bearbeiten — Inhalte, Text und Darstellung. Weitere Vorstandsfunktionen sind mit dieser Rolle nicht verbunden.",
            },
          ],
        },
      ],
    },
  ],
};
