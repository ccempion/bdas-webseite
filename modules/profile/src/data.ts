import { UNIVERSITIES } from "./universities.generated";

/** Stable enum keys + German UI labels. Keys are stored; labels are display. */
export const ABSCHLUSSART_OPTIONS = [
  { value: "bachelor", label: "Bachelor" },
  { value: "master", label: "Master" },
  { value: "doktor", label: "Doktor / Promotion" },
  { value: "staatsexamen", label: "Staatsexamen" },
  { value: "duales_studium", label: "Duales Studium" },
  { value: "diplom", label: "Diplom" },
] as const;

export const GEFUNDEN_DURCH_OPTIONS = [
  { value: "webseite", label: "Webseite" },
  { value: "instagram", label: "Instagram" },
  { value: "empfehlung", label: "Empfehlung" },
] as const;

export const ABSCHLUSSART_KEYS = ABSCHLUSSART_OPTIONS.map((o) => o.value);
export const GEFUNDEN_DURCH_KEYS = GEFUNDEN_DURCH_OPTIONS.map((o) => o.value);

/** The "not in the list" affordance value. Selecting it reveals a free-text
 *  field whose typed value is stored directly in `uni`. */
export const SONSTIGE = "Sonstige";

export { UNIVERSITIES };

/** The names this list carried while it was hand-curated. Profiles saved back
 *  then still store them, so each has to keep resolving to its entry in the
 *  generated list — otherwise the edit form would show a member's university as
 *  free text under "Sonstige" and re-save it that way. */
const LEGACY_ALIASES = new Map<string, string>([
  ["Technische Universität Berlin", "TU Berlin"],
  ["Ruhr-Universität Bochum", "Universität Bochum"],
  ["Technische Universität Braunschweig", "TU Braunschweig"],
  ["Technische Universität Chemnitz", "TU Chemnitz"],
  ["Technische Universität Darmstadt", "TU Darmstadt"],
  ["Technische Universität Dortmund", "TU Dortmund"],
  ["Technische Universität Dresden", "TU Dresden"],
  ["Heinrich-Heine-Universität Düsseldorf", "Universität Düsseldorf"],
  [
    "Katholische Universität Eichstätt-Ingolstadt",
    "Katholische Universität Eichstätt - Ingolstadt",
  ],
  ["Friedrich-Alexander-Universität Erlangen-Nürnberg", "FAU Erlangen-Nürnberg"],
  ["Universität Frankfurt (Goethe-Universität)", "Universität Frankfurt am Main"],
  ["Universität Freiburg", "Universität Freiburg im Breisgau"],
  ["Justus-Liebig-Universität Gießen", "Universität Giessen"],
  ["Martin-Luther-Universität Halle-Wittenberg", "Universität Halle-Wittenberg"],
  ["Technische Universität Hamburg", "TU Hamburg"],
  ["Universität Hannover (Leibniz Universität)", "Leibniz Universität Hannover"],
  ["Technische Universität Ilmenau", "TU Ilmenau"],
  ["Friedrich-Schiller-Universität Jena", "Universität Jena"],
  ["Universität Kaiserslautern-Landau (RPTU)", "RPTU Kaiserslautern-Landau"],
  ["Karlsruher Institut für Technologie (KIT)", "Karlsruher Institut für Technologie"],
  ["Christian-Albrechts-Universität zu Kiel", "Universität zu Kiel"],
  ["Otto-von-Guericke-Universität Magdeburg", "Universität Magdeburg"],
  ["Johannes Gutenberg-Universität Mainz", "Universität Mainz"],
  ["Philipps-Universität Marburg", "Universität Marburg"],
  ["Ludwig-Maximilians-Universität München (LMU)", "LMU München"],
  ["Technische Universität München (TUM)", "TU München"],
  ["Universität Wuppertal", "Bergische Universität Wuppertal"],
]);

const UNI_SET = new Set(UNIVERSITIES);

/** The list entry a stored `uni` corresponds to, or null when it is free text
 *  the member typed in under "Sonstige". */
export function canonicalUniversity(value: string): string | null {
  if (UNI_SET.has(value)) return value;
  return LEGACY_ALIASES.get(value) ?? null;
}
