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

/** Curated list of German universities. Shared by server validation and the UI
 *  so both agree on the canonical set. Extend as the federation grows. */
export const UNIVERSITIES: ReadonlyArray<string> = [
  "RWTH Aachen",
  "Universität Augsburg",
  "Universität Bamberg",
  "Universität Bayreuth",
  "Freie Universität Berlin",
  "Humboldt-Universität zu Berlin",
  "Technische Universität Berlin",
  "Universität Bielefeld",
  "Ruhr-Universität Bochum",
  "Universität Bonn",
  "Technische Universität Braunschweig",
  "Universität Bremen",
  "Technische Universität Chemnitz",
  "Technische Universität Darmstadt",
  "Technische Universität Dortmund",
  "Technische Universität Dresden",
  "Universität Duisburg-Essen",
  "Heinrich-Heine-Universität Düsseldorf",
  "Katholische Universität Eichstätt-Ingolstadt",
  "Friedrich-Alexander-Universität Erlangen-Nürnberg",
  "Universität Frankfurt (Goethe-Universität)",
  "Europa-Universität Viadrina Frankfurt (Oder)",
  "Universität Freiburg",
  "Justus-Liebig-Universität Gießen",
  "Universität Göttingen",
  "Universität Greifswald",
  "FernUniversität in Hagen",
  "Martin-Luther-Universität Halle-Wittenberg",
  "Universität Hamburg",
  "Technische Universität Hamburg",
  "Universität Hannover (Leibniz Universität)",
  "Medizinische Hochschule Hannover",
  "Universität Heidelberg",
  "Universität Hohenheim",
  "Technische Universität Ilmenau",
  "Friedrich-Schiller-Universität Jena",
  "Universität Kaiserslautern-Landau (RPTU)",
  "Karlsruher Institut für Technologie (KIT)",
  "Universität Kassel",
  "Christian-Albrechts-Universität zu Kiel",
  "Universität zu Köln",
  "Universität Konstanz",
  "Universität Leipzig",
  "Universität zu Lübeck",
  "Otto-von-Guericke-Universität Magdeburg",
  "Johannes Gutenberg-Universität Mainz",
  "Universität Mannheim",
  "Philipps-Universität Marburg",
  "Ludwig-Maximilians-Universität München (LMU)",
  "Technische Universität München (TUM)",
  "Universität Münster",
  "Universität Oldenburg",
  "Universität Osnabrück",
  "Universität Paderborn",
  "Universität Passau",
  "Universität Potsdam",
  "Universität Regensburg",
  "Universität Rostock",
  "Universität des Saarlandes",
  "Universität Siegen",
  "Universität Stuttgart",
  "Universität Trier",
  "Universität Tübingen",
  "Universität Ulm",
  "Universität Würzburg",
  "Universität Wuppertal",
];

const UNI_SET = new Set(UNIVERSITIES);
export function isKnownUniversity(value: string): boolean {
  return UNI_SET.has(value);
}
