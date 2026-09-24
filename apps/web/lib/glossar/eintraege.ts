/**
 * Das Glossar hinter den Info-Punkten (Spec 2026-09-24-info-punkte-glossar).
 * Reine Daten: jeder `key` ist stabil und wird beim späteren Umzug in die
 * Datenbank zum Primärschlüssel. `begriff` ist genau das Wort aus der
 * Oberfläche; ändert sich das Wort, ändert sich der Eintrag im selben PR.
 */

export type GlossarBereich =
  | "verband"
  | "menschen"
  | "aufnahme"
  | "rollen"
  | "dateien"
  | "veranstaltungen"
  | "blog"
  | "konto";

export type GlossarEintrag = {
  readonly key: string;
  readonly begriff: string;
  readonly text: string;
  readonly bereich: GlossarBereich;
  /** Nur für Vorstände relevant: auf der Glossar-Seite nur ihnen gezeigt. */
  readonly nurFuer?: "vorstand";
};

export const GLOSSAR_BEREICHE: ReadonlyArray<{ key: GlossarBereich; label: string }> = [
  { key: "verband", label: "Verband und Gruppen" },
  { key: "menschen", label: "Menschen und Nutzertypen" },
  { key: "aufnahme", label: "Aufnahme und Gruppenzugehörigkeit" },
  { key: "rollen", label: "Rollen" },
  { key: "dateien", label: "Dateien" },
  { key: "veranstaltungen", label: "Veranstaltungen" },
  { key: "blog", label: "Blog" },
  { key: "konto", label: "Konto und Datenschutz" },
];

export const GLOSSAR: readonly GlossarEintrag[] = [
  {
    key: "bdas",
    begriff: "BDAS",
    bereich: "verband",
    text: "Der Bund der Alevitischen Studierenden in Deutschland: der bundesweite Verband alevitischer Studierender, getragen von den Hochschulgruppen vor Ort.",
  },
  {
    key: "hochschulgruppe",
    begriff: "Hochschulgruppe",
    bereich: "verband",
    text: "Eine BDAS-Gruppe an einem Hochschulort, z. B. BDAS Köln. Sie hat einen eigenen Vorstand, eigene Veranstaltungen und eigene Dateien.",
  },
  {
    key: "bdaj",
    begriff: "BDAJ",
    bereich: "verband",
    text: "Der Bund der Alevitischen Jugendlichen, der Jugendverband und Partner von BDAS. BDAJ-Mitglieder haben hier einen gemeinsamen Bereich mit BDAS.",
  },
  {
    key: "aabf",
    begriff: "AABF",
    bereich: "verband",
    text: "Die Alevitische Gemeinde Deutschland, der Dachverband der alevitischen Gemeinden in Deutschland.",
  },
  {
    key: "netzwerk",
    begriff: "BDAS Netzwerk",
    bereich: "verband",
    text: "Die gemeinsame Gruppe für Förderer*innen: Leute, die BDAS unterstützen, ohne selbst in einer Hochschulgruppe zu sein. Über die Aufnahme entscheidet der Bundesvorstand.",
  },
  {
    key: "partnerorganisation",
    begriff: "Partnerorganisation",
    bereich: "verband",
    text: "Eine Organisation, die mit BDAS zusammenarbeitet und hier einen eigenen Bereich hat, zurzeit die BDAJ. Ihre Mitglieder nimmt der Bundesvorstand auf.",
  },
  {
    key: "bundesweit",
    begriff: "Föderationsweit / bundesweit",
    bereich: "verband",
    text: "Betrifft den ganzen Verband, nicht nur eine Hochschulgruppe. Föderationsweite Veranstaltungen legt nur der Bundesvorstand an.",
  },
  {
    key: "nutzertyp",
    begriff: "Nutzertyp",
    bereich: "menschen",
    text: "Was dich am besten beschreibt: studierend, ehemals studierend (Alumni), in der BDAJ aktiv oder Förderer*in. Davon hängt ab, wer über deine Aufnahme entscheidet und was du siehst.",
  },
  {
    key: "mitglied",
    begriff: "Mitglied",
    bereich: "menschen",
    text: "Wer aufgenommen ist und entweder zu einer Hochschulgruppe gehört oder als Alumna/Alumnus markiert ist. Mitglieder sehen Mitglieder-Veranstaltungen, Dateien und können kommentieren.",
  },
  {
    key: "alumni",
    begriff: "Alumni / Alumna / Alumnus",
    bereich: "menschen",
    text: "Ehemalige Studierende. Wer schon Mitglied war, bekommt die Alumni-Markierung; wer sich neu als Alumni bewirbt, wird vom Bundesvorstand aufgenommen.",
  },
  {
    key: "foerderer",
    begriff: "Förderer*in",
    bereich: "menschen",
    text: "Jemand, der BDAS unterstützt oder einfach näher dran sein will, ohne in einer Hochschulgruppe zu sein. Förderer*innen gehören zum BDAS Netzwerk.",
  },
  {
    key: "bdaj-mitglied",
    begriff: "BDAJ-Mitglied",
    bereich: "menschen",
    text: "Wer in der BDAJ aktiv ist. Du bekommst Zugang zum gemeinsamen Bereich von BDAJ und BDAS; über die Aufnahme entscheidet der Bundesvorstand.",
  },
  {
    key: "bdaj-funktion",
    begriff: "Funktion in der BDAJ",
    bereich: "menschen",
    text: "Deine Aufgabe in der BDAJ: Vorstandsmitglied, Mitglied oder Geschäftsstelle. So weiß der Bundesvorstand, welche Zugänge du brauchst.",
  },
  {
    key: "gast",
    begriff: "Gast / Gastanmeldung",
    bereich: "menschen",
    text: "Wer kein Konto hat, kann sich zu öffentlichen Veranstaltungen mit Name und E-Mail als Gast anmelden, wenn die Veranstaltung das erlaubt.",
  },
  {
    key: "bewerbung",
    begriff: "Bewerbung",
    bereich: "aufnahme",
    text: "Dein Antrag, in eine Gruppe aufgenommen zu werden. Darüber entscheidet der Vorstand dieser Gruppe; bis dahin ist sie offen. Nach einer Ablehnung kannst du dich sofort erneut bewerben.",
  },
  {
    key: "warten-auf-beitritt",
    begriff: "Warten auf Beitritt / Bewerbung eingereicht",
    bereich: "aufnahme",
    text: "Deine Bewerbung ist angekommen, der Vorstand hat noch nicht entschieden. Du bekommst eine E-Mail, sobald er entschieden hat.",
  },
  {
    key: "aufnahme",
    begriff: "Aufnahme / aufgenommen",
    bereich: "aufnahme",
    text: "Der Vorstand hat deine Bewerbung angenommen. Ab dann bist du Mitglied deiner Gruppe.",
  },
  {
    key: "ablehnungsgrund",
    begriff: "Ablehnungsgrund",
    bereich: "aufnahme",
    text: "Lehnt ein Vorstand eine Bewerbung ab, muss er einen Grund angeben. Die Person sieht ihn. Schreib ihn so, dass du ihn ihr auch direkt sagen würdest.",
  },
  {
    key: "hauptgruppe",
    begriff: "Hauptgruppe",
    bereich: "aufnahme",
    text: "Die Gruppe, zu der du gehörst. Man gehört immer zu höchstens einer. Ein Wechsel geht über einen Wechselantrag.",
  },
  {
    key: "wechselantrag",
    begriff: "Wechselantrag / Gruppenwechsel",
    bereich: "aufnahme",
    text: "Dein Antrag, in eine andere Gruppe zu wechseln. Darüber entscheidet der Vorstand der neuen Gruppe. Mit dem Wechsel enden deine Rollen in der alten Gruppe.",
  },
  {
    key: "ohne-gruppe",
    begriff: "Ohne Gruppe",
    bereich: "aufnahme",
    text: "Für alle, an deren Studienort es (noch) keine Hochschulgruppe gibt, oder die bewusst keiner beitreten. Über die Aufnahme entscheidet der Bundesvorstand.",
  },
  {
    key: "gruppe-gruenden",
    begriff: "Gruppe gründen",
    bereich: "aufnahme",
    text: "Gibt es an deinem Ort keine Hochschulgruppe, kannst du eine aufbauen. Der Bundesvorstand meldet sich und hilft dir dabei.",
  },
  {
    key: "erweitertes-profil",
    begriff: "Erweitertes Profil / Profil vervollständigen",
    bereich: "aufnahme",
    text: "Die Angaben über dich, die der Vorstand für die Entscheidung braucht, z. B. Hochschule und Fach. Erst wenn sie vollständig sind, geht deine Bewerbung raus.",
  },
  {
    key: "bestaetigungslink",
    begriff: "Bestätigungslink",
    bereich: "aufnahme",
    text: "Ein Link in einer E-Mail, mit dem du bestätigst, dass die Adresse dir gehört. Er gilt 24 Stunden und meldet dich im selben Browser gleich an.",
  },
  {
    key: "einstiegslink",
    begriff: "Einstiegslink",
    bereich: "aufnahme",
    nurFuer: "vorstand",
    text: "Ein Registrierungslink mit eigener Begrüßung, z. B. für einen Flyer oder eine Veranstaltung. Wer darüber kommt, wird passend begrüßt, und die Plattform merkt sich, über welchen Link die Person kam.",
  },
  {
    key: "ohne-profil",
    begriff: "Ohne Profil",
    bereich: "aufnahme",
    nurFuer: "vorstand",
    text: "Konten, die sich registriert, aber nie ein Profil angelegt haben. Der Bundesvorstand kann sie löschen, meist sind es verwaiste oder automatisch angelegte Konten.",
  },
  {
    key: "notfall-zustaendigkeit",
    begriff: "Notfall-Zuständigkeit",
    bereich: "aufnahme",
    nurFuer: "vorstand",
    text: "Hat eine Gruppe keinen Vorstand, entscheidet der Bundesvorstand über ihre Bewerbungen, damit niemand ewig wartet. Sonst entscheidet immer der Vorstand der Gruppe.",
  },
  {
    key: "rolle",
    begriff: "Rolle",
    bereich: "rollen",
    text: "Eine Aufgabe mit zusätzlichen Rechten, z. B. Veranstaltungen verwalten. Rollen gelten für eine Gruppe und vergibt der Lead der Gruppe oder der Bundesvorstand.",
  },
  {
    key: "bundesvorstand",
    begriff: "Bundesvorstand",
    bereich: "rollen",
    text: "Der gewählte Vorstand des ganzen Verbands. Er verwaltet alle Gruppen und entscheidet über Aufnahmen ohne Hochschulgruppe, von Alumni, Förderer*innen und BDAJ-Mitgliedern.",
  },
  {
    key: "vorstand",
    begriff: "Vorstand (deiner Gruppe)",
    bereich: "rollen",
    text: "Die Leute, die eine Hochschulgruppe leiten. Sie entscheiden über Bewerbungen und vergeben Rollen in ihrer Gruppe.",
  },
  {
    key: "lead",
    begriff: "Lead",
    bereich: "rollen",
    text: "Der Vorstand einer Hochschulgruppe auf der Plattform: entscheidet über Bewerbungen, verwaltet die Mitglieder und vergibt Rollen in seiner Gruppe.",
  },
  {
    key: "event-manager",
    begriff: "Event-Manager",
    bereich: "rollen",
    text: "Darf alle Veranstaltungen der Gruppe anlegen, bearbeiten und absagen sowie Blogbeiträge schreiben. Ohne Hochschulgruppe nur die eigenen Veranstaltungen.",
  },
  {
    key: "seiten-editor",
    begriff: "Seiten-Editor",
    bereich: "rollen",
    text: "Darf die öffentliche Seite der Gruppe gestalten. Name und Stadt der Gruppe bleiben fest.",
  },
  {
    key: "datei-manager",
    begriff: "Datei-Manager",
    bereich: "rollen",
    text: "Darf im Mitgliederordner der Gruppe Ordner anlegen und Dateien verwalten, aber nicht im Vorstandsordner.",
  },
  {
    key: "blogger",
    begriff: "Blogger",
    bereich: "rollen",
    text: "Darf Blogbeiträge schreiben und veröffentlichen.",
  },
  {
    key: "alumni-markierung",
    begriff: "Als Alumnus markieren",
    bereich: "rollen",
    nurFuer: "vorstand",
    text: "Kennzeichnet ein Mitglied, das nicht mehr studiert. Es bleibt Mitglied und behält den Zugang.",
  },
  {
    key: "ordner-alle-mitglieder",
    begriff: "Alle Mitglieder",
    bereich: "dateien",
    text: "Ein Ordner des Bundesvorstands, den jedes Mitglied im ganzen Verband lesen kann.",
  },
  {
    key: "ordner-gruppenmitglieder",
    begriff: "Gruppenmitglieder",
    bereich: "dateien",
    text: "Der Ordner deiner Hochschulgruppe. Alle Mitglieder der Gruppe können lesen, verwalten dürfen der Lead und Datei-Manager.",
  },
  {
    key: "ordner-lokaler-vorstand",
    begriff: "Lokaler Vorstand",
    bereich: "dateien",
    text: "Der interne Ordner des Vorstands deiner Gruppe. Nur der Vorstand sieht ihn.",
  },
  {
    key: "ordner-bundesvorstand",
    begriff: "Bundesvorstand (Ordner)",
    bereich: "dateien",
    text: "Der interne Ordner des Bundesvorstands. Nur der Bundesvorstand sieht ihn.",
  },
  {
    key: "verteiler",
    begriff: "Bundesvorstand-Verteiler",
    bereich: "dateien",
    text: "Ein Ordner, über den der Bundesvorstand Unterlagen an alle Gruppenvorstände verteilt. Hochladen kann nur der Bundesvorstand, lesen jeder Lead.",
  },
  {
    key: "ordnerfreigabe",
    begriff: "Ordnerfreigabe",
    bereich: "dateien",
    text: "Zugang für eine einzelne Person zu einem bestimmten Ordner, etwa für BDAJ-Mitglieder. Je nach Freigabe nur lesen oder auch hochladen.",
  },
  {
    key: "speicherplatz",
    begriff: "Speicherplatz",
    bereich: "dateien",
    text: "Eine Datei darf höchstens 25 MB groß sein, ein Ordner insgesamt 5 GB.",
  },
  {
    key: "sichtbarkeit",
    begriff: "Sichtbarkeit",
    bereich: "veranstaltungen",
    nurFuer: "vorstand",
    text: "Wer die Veranstaltung sieht. Öffentlich: alle, auch ohne Konto. Nur Mitglieder: alle Mitglieder im Verband. Nur Gruppe: nur die Mitglieder dieser Gruppe.",
  },
  {
    key: "warteliste",
    begriff: "Warteliste",
    bereich: "veranstaltungen",
    text: "Ist eine Veranstaltung voll, kommst du auf die Warteliste. Sagt jemand ab, rückst du automatisch nach und bekommst eine E-Mail.",
  },
  {
    key: "gaeste-zulassen",
    begriff: "Gäste zulassen",
    bereich: "veranstaltungen",
    nurFuer: "vorstand",
    text: "Erlaubt Leuten ohne Konto, sich mit Name und E-Mail anzumelden. Geht nur bei öffentlichen Veranstaltungen.",
  },
  {
    key: "entwurf",
    begriff: "Entwurf",
    bereich: "veranstaltungen",
    text: "Noch nicht veröffentlicht. Nur, wer die Veranstaltung oder den Beitrag verwaltet, sieht ihn.",
  },
  {
    key: "abgesagt",
    begriff: "Abgesagt",
    bereich: "veranstaltungen",
    text: "Die Veranstaltung findet nicht statt. Angemeldete bekommen Bescheid.",
  },
  {
    key: "kategorie",
    begriff: "Kategorie",
    bereich: "blog",
    text: "Das Thema eines Beitrags. Damit kannst du die Liste filtern.",
  },
  {
    key: "melden",
    begriff: "Melden",
    bereich: "blog",
    text: "Stört dich ein Beitrag, kannst du ihn melden. Der Bundesvorstand sieht die Meldung und entscheidet, ob der Beitrag bleibt.",
  },
  {
    key: "kommentare",
    begriff: "Kommentare",
    bereich: "blog",
    text: "Kommentieren können alle Mitglieder und Alumni. Kommentare sind reiner Text, ohne Antworten auf Antworten.",
  },
  {
    key: "datenexport",
    begriff: "Datenexport",
    bereich: "konto",
    text: "Lädt alles herunter, was die Plattform über dich gespeichert hat, als Datei. Das ist dein Recht nach der Datenschutz-Grundverordnung.",
  },
  {
    key: "konto-loeschen",
    begriff: "Konto löschen",
    bereich: "konto",
    text: "Dein Konto wird nach 30 Tagen endgültig gelöscht, samt deiner Daten. Bis dahin kannst du es über den Link in der E-Mail zurückholen.",
  },
  {
    key: "reaktivieren",
    begriff: "Konto reaktivieren",
    bereich: "konto",
    text: "Holt ein Konto zurück, dessen Löschung du beantragt hast, solange die 30 Tage nicht um sind.",
  },
  {
    key: "newsletter",
    begriff: "Newsletter",
    bereich: "konto",
    text: "Ein paar Mal im Jahr eine E-Mail mit Neuem aus dem Verband und den Hochschulgruppen. Du kannst dich jederzeit unter Mein Konto abmelden.",
  },
  {
    key: "double-opt-in",
    begriff: "Bestätigung (Double-Opt-in)",
    bereich: "konto",
    nurFuer: "vorstand",
    text: "Wer sich ohne Konto für den Newsletter einträgt, muss das per E-Mail-Link bestätigen. Unbestätigte Einträge bekommen keine Newsletter.",
  },
  {
    key: "andere-geraete",
    begriff: "Andere Geräte abmelden",
    bereich: "konto",
    text: "Nach einer Passwortänderung wirst du überall sonst abgemeldet, damit niemand mit dem alten Passwort drin bleibt.",
  },
];

const BY_KEY = new Map(GLOSSAR.map((e) => [e.key, e]));

export function glossarEintrag(key: string): GlossarEintrag | undefined {
  return BY_KEY.get(key);
}
