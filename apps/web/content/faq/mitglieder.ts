import type { FaqSection } from "./types";

/**
 * Everyday member capabilities — the default section for members without a
 * board role. visibleTo is "all", not ["member", "alumnus"]: this is a help
 * page, not a data-access surface, and a pending/inactive user needs exactly
 * this content (profile, events, group change) most.
 */
export const mitglieder: FaqSection = {
  key: "mitglieder",
  title: "Mitglieder",
  intro: "Was du als Mitglied auf der Plattform tun kannst.",
  visibleTo: "all",
  entries: [
    {
      id: "profil",
      question: "Wie pflege ich mein Profil?",
      body: [
        {
          kind: "p",
          text: "Unter „Mein Konto“ verwaltest du deine persönlichen Angaben und Kontoeinstellungen.",
        },
        { kind: "link", href: "/account", label: "Zu meinem Konto" },
      ],
    },
    {
      id: "events",
      question: "Wie melde ich mich für Veranstaltungen an?",
      body: [
        {
          kind: "steps",
          items: [
            "Die Veranstaltungsliste öffnen und ein Event auswählen.",
            "An- oder abmelden. Ist das Event voll, kommst du auf die Warteliste.",
            "Wird ein Platz frei, rückst du automatisch nach und wirst per E-Mail benachrichtigt.",
          ],
        },
        { kind: "link", href: "/events", label: "Zu den Veranstaltungen" },
      ],
    },
    {
      id: "interne-infos",
      question: "Wo bekomme ich interne Infos, die nicht öffentlich sind?",
      body: [
        {
          kind: "p",
          text: "Über den Blog: Beiträge mit Sichtbarkeit „Nur Mitglieder“ sind ausschließlich für angemeldete, aktive Mitglieder lesbar. Ein separates Mitgliederverzeichnis gibt es nicht — die eigene Gruppe erreichst du über deren öffentliche Gruppenseite.",
        },
        { kind: "link", href: "/blog", label: "Zum Blog" },
      ],
    },
    {
      id: "gruppenwechsel",
      question: "Wie wechsle ich die Gruppe?",
      body: [
        {
          kind: "p",
          text: "Du kannst einen Gruppenwechsel beantragen. Über die Aufnahme entscheidet der Vorstand der Zielgruppe.",
        },
      ],
    },
    {
      id: "dateien",
      question: "Wo finde ich geteilte Dateien?",
      body: [
        {
          kind: "p",
          text: "Als Mitglied hast du Zugriff auf den Mitglieder-Ordner im Dateibereich mit Dokumenten und Vorlagen sowie auf den Ordner deiner eigenen Gruppe.",
        },
      ],
    },
    {
      id: "blog-schreiben",
      question: "Kann ich selbst Blog-Beiträge schreiben?",
      body: [
        {
          kind: "p",
          text: "Ja, wenn du als aktives Mitglied geführt wirst. Du kannst eigene Beiträge jederzeit bearbeiten oder löschen und fremde Beiträge melden, wenn sie gegen die Regeln verstoßen.",
        },
      ],
    },
    {
      id: "alumni",
      question: "Was ändert sich als Alumni?",
      body: [
        {
          kind: "p",
          text: "Als Alumni giltst du nicht mehr als aktives Mitglied. Du kannst weiterhin Blog-Beiträge verfassen. Für Veranstaltungen kannst du dich erst wieder anmelden, sobald du erneut als aktiv geführt wirst.",
        },
      ],
    },
  ],
};
