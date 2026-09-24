/**
 * Word → glossary key for texts that come from data rather than JSX
 * (`<BegriffText>`). Kept in one file so `eintraege.test.ts` can check every
 * key exists.
 */
import type { FolderScope } from "@bdas/files";

/** Onboarding wizard: result screen, group choice, account step. */
export const ONBOARDING_WOERTER: Readonly<Record<string, string>> = {
  Bundesvorstand: "bundesvorstand",
  Vorstand: "vorstand",
  Hochschulgruppe: "hochschulgruppe",
  "Alumna oder Alumnus": "alumni",
  Alumni: "alumni",
  "Förderer*in": "foerderer",
  "BDAJ-Mitglied": "bdaj-mitglied",
  BDAJ: "bdaj",
  Bewerbung: "bewerbung",
  "ohne Gruppe vor Ort": "ohne-gruppe",
  Bestätigungslink: "bestaetigungslink",
};

/** Mein Konto: status labels and notices. */
export const KONTO_WOERTER: Readonly<Record<string, string>> = {
  "Warten auf Beitritt": "warten-auf-beitritt",
  "Bewerbung eingereicht": "warten-auf-beitritt",
  "Förderer:in": "foerderer",
  Partnerorganisation: "partnerorganisation",
  Gruppe: "hauptgruppe",
  Wechselantrag: "wechselantrag",
  Gruppenwechsel: "wechselantrag",
  Vorstand: "vorstand",
};

/** Dateien: folder scope → its term (labels in `_files/folder-meta.ts`). */
export const ORDNER_BEGRIFFE = {
  members_all: "ordner-alle-mitglieder",
  group_members: "ordner-gruppenmitglieder",
  local_board: "ordner-lokaler-vorstand",
  federal_board: "ordner-bundesvorstand",
  board_broadcast: "verteiler",
} as const satisfies Record<FolderScope, string>;
