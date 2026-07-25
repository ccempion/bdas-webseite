import { describe, expect, it } from "vitest";

import { buildTree, type Kasten } from "./org-tree";

const k = (ebene: Kasten["ebene"], titel: string): Kasten => ({
  ebene,
  titel,
  untertitel: "",
  link: "",
  logo: "",
  hervorheben: false,
});

/** Titles only, so the assertions read like the outline the board typed. */
const shape = (nodes: ReturnType<typeof buildTree>): unknown =>
  nodes.map((n) => ({ [n.kasten.titel]: shape(n.kinder) }));

describe("buildTree", () => {
  it("nests each row under the nearest preceding shallower row", () => {
    expect(
      shape(buildTree([k("1", "Bundeskonferenz"), k("2", "Bundesvorstand"), k("3", "AG Bildung")])),
    ).toEqual([{ Bundeskonferenz: [{ Bundesvorstand: [{ "AG Bildung": [] }] }] }]);
  });

  it("keeps siblings at the same level side by side", () => {
    expect(shape(buildTree([k("1", "BDAS"), k("2", "BSR"), k("2", "BDAJ")]))).toEqual([
      { BDAS: [{ BSR: [] }, { BDAJ: [] }] },
    ]);
  });

  it("returns to a higher level after a deeper branch", () => {
    expect(shape(buildTree([k("1", "BDAS"), k("2", "BuVo"), k("3", "AG"), k("2", "BSR")]))).toEqual(
      [{ BDAS: [{ BuVo: [{ AG: [] }] }, { BSR: [] }] }],
    );
  });

  it("attaches a skipped level to the nearest shallower ancestor", () => {
    expect(shape(buildTree([k("1", "BDAS"), k("3", "AG Bildung")]))).toEqual([
      { BDAS: [{ "AG Bildung": [] }] },
    ]);
  });

  it("treats a leading non-root row as a root rather than dropping it", () => {
    expect(shape(buildTree([k("3", "Verwaist"), k("4", "Kind")]))).toEqual([
      { Verwaist: [{ Kind: [] }] },
    ]);
  });

  it("supports several roots as a forest", () => {
    expect(shape(buildTree([k("1", "BDAS"), k("2", "BSR"), k("1", "AABF")]))).toEqual([
      { BDAS: [{ BSR: [] }] },
      { AABF: [] },
    ]);
  });

  it("returns no roots for an empty list", () => {
    expect(buildTree([])).toEqual([]);
  });
});
