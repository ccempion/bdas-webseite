/**
 * Stabile Schlüssel für "wo taucht dieser Eintrag als Kontext-Hilfe auf".
 * Ab PR 3 nur für das Board-Formular ("Anzeigen bei"); Routen-Matching und
 * das Hilfe-Panel kommen in PR 5 (Spec §7) — bis dahin liest niemand diese
 * Schlüssel zur Laufzeit, sie werden nur auf Einträge geschrieben.
 */
export type FaqContext = { readonly key: string; readonly label: string };

export const FAQ_CONTEXTS: readonly FaqContext[] = [
  { key: "events.erstellen", label: "Event erstellen" },
  { key: "dateien", label: "Dateien" },
  { key: "board.mitglieder", label: "Mitgliederverwaltung" },
  { key: "board.gruppen", label: "Gruppenverwaltung" },
  { key: "profil", label: "Profil" },
];
