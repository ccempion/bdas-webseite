import type { FaqSection } from "./types";

/** Everyday member capabilities — the default section for members without a board role. */
export const mitglieder: FaqSection = {
  key: "mitglieder",
  title: "Mitglieder",
  intro: "Was du als Mitglied auf der Plattform tun kannst.",
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
      id: "verzeichnis-ankuendigungen",
      question: "Sehe ich die anderen Mitglieder und interne Infos?",
      body: [
        {
          kind: "p",
          text: "Du siehst das Mitgliederverzeichnis deiner eigenen Gruppe sowie die internen Ankündigungen für Mitglieder.",
        },
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
          text: "Als Mitglied hast du Zugriff auf den Mitglieder-Ordner im Dateibereich mit Dokumenten und Vorlagen.",
        },
      ],
    },
    {
      id: "beitraege",
      question: "Was hat es mit Beiträgen und Beitrittsgebühren auf sich?",
      body: [
        {
          kind: "p",
          text: "Du kannst freiwillige Mitgliedsbeiträge zahlen und giltst dann als zahlendes Mitglied. Verlangt deine Gruppe eine Beitrittsgebühr, wird diese beim Beitritt fällig.",
        },
      ],
    },
    {
      id: "blog-projekte",
      question: "Kann ich Beiträge lesen und Projekte entdecken?",
      body: [
        {
          kind: "p",
          text: "Du kannst Blog-Beiträge lesen (je nach Sichtbarkeit) und die Projekte aller Gruppen durchstöbern, um Ideen zu entdecken und wiederzuverwenden.",
        },
        { kind: "link", href: "/projekte", label: "Zu den Projekten" },
      ],
    },
    {
      id: "alumni",
      question: "Was ändert sich als Alumni?",
      body: [
        {
          kind: "p",
          text: "Als Alumni hast du weiterhin Lesezugriff auf das Netzwerk und kannst den Newsletter abonnieren. Für Veranstaltungen kannst du dich erst wieder anmelden, wenn du erneut als aktiv geführt wirst.",
        },
      ],
    },
  ],
};
