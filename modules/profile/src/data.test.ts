import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { canonicalUniversity, UNIVERSITIES } from "./data";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

/** Every name the hand-curated list carried before it was replaced by the HRK
 *  export. Members who picked one of these still have it stored, so each must
 *  keep resolving — see canonicalUniversity. */
const LEGACY_NAMES = [
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

describe("UNIVERSITIES", () => {
  it("covers the whole HRK export", () => {
    // One header line, one record per institution, and two records whose name
    // wraps onto a second physical line — hence more lines than entries.
    const source = readFileSync(join(DATA_DIR, "hochschulen.tsv"), "utf8");
    expect(source.split("\n").filter((l) => l.trim() !== "")).toHaveLength(UNIVERSITIES.length + 3);
    expect(UNIVERSITIES).toHaveLength(388);
  });

  it("has no duplicates and no untrimmed names", () => {
    expect(new Set(UNIVERSITIES).size).toBe(UNIVERSITIES.length);
    expect(UNIVERSITIES.filter((u) => u !== u.trim() || u === "")).toEqual([]);
  });

  it("is sorted with German collation", () => {
    const sorted = [...UNIVERSITIES].sort((a, b) => a.localeCompare(b, "de"));
    expect(UNIVERSITIES).toEqual(sorted);
  });

  it("fits the stored column", () => {
    // MAX_UNI in types.ts — a list entry must never fail its own validation.
    expect(Math.max(...UNIVERSITIES.map((u) => u.length))).toBeLessThanOrEqual(200);
  });
});

describe("canonicalUniversity", () => {
  it("returns a list entry unchanged", () => {
    expect(canonicalUniversity("RWTH Aachen")).toBe("RWTH Aachen");
  });

  it("resolves every name the hand-curated list used", () => {
    const unresolved = LEGACY_NAMES.filter((n) => canonicalUniversity(n) === null);
    expect(unresolved).toEqual([]);
  });

  it("resolves legacy names to an actual list entry", () => {
    const resolved = LEGACY_NAMES.map((n) => canonicalUniversity(n));
    expect(resolved.filter((r) => r !== null && !UNIVERSITIES.includes(r))).toEqual([]);
  });

  it("renames rather than duplicates — no legacy alias shadows a list entry", () => {
    // A name that is both a list entry and an alias key would mean the same
    // institution is offered twice under different spellings.
    const aliasedOnly = LEGACY_NAMES.filter((n) => !UNIVERSITIES.includes(n));
    expect(aliasedOnly.map((n) => canonicalUniversity(n)).filter((r) => r === null)).toEqual([]);
  });

  it("returns null for free text the member typed in", () => {
    expect(canonicalUniversity("Hochschule Irgendwo")).toBeNull();
    expect(canonicalUniversity("")).toBeNull();
  });

  it("is not fooled by inherited object properties", () => {
    expect(canonicalUniversity("constructor")).toBeNull();
    expect(canonicalUniversity("__proto__")).toBeNull();
  });
});
