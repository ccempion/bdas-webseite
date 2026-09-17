import { describe, expect, it } from "vitest";

import { FLOW } from "./flow";
import { nextStep, visibleOptions, walk } from "./next-step";
import type { Answers, FlowEnv } from "./types";

const ENV: FlowEnv = {
  groups: [{ id: "grp_ber", name: "BDAS Berlin", city: "Berlin" }],
  bdajGroupId: "grp_bdaj",
  netzwerkGroupId: "grp_netz",
};
const NAME = { firstName: "Lea", lastName: "Yıldız" };

describe("nextStep — every path", () => {
  const cases: Array<[string, Answers, ReturnType<typeof nextStep>]> = [
    ["nothing answered", {}, { kind: "question", question: "typ" }],
    ["type only", { typ: "studiere" }, { kind: "question", question: "name" }],
    [
      "student without place",
      { typ: "studiere", name: NAME },
      { kind: "question", question: "studienort" },
    ],
    [
      "student with an active group",
      { typ: "studiere", name: NAME, studienort: { kind: "group", groupId: "grp_ber" } },
      { kind: "outcome", outcome: "student" },
    ],
    [
      "student in a city without a group",
      { typ: "studiere", name: NAME, studienort: { kind: "city", city: "Passau" } },
      { kind: "outcome", outcome: "student_ohne_gruppe" },
    ],
    [
      "student whose group is gone",
      { typ: "studiere", name: NAME, studienort: { kind: "group", groupId: "grp_weg" } },
      { kind: "outcome", outcome: "student_ohne_gruppe" },
    ],
    [
      "alumnus without place",
      { typ: "studiert", name: NAME },
      { kind: "question", question: "aktiv_wo" },
    ],
    [
      "alumnus who skipped",
      { typ: "studiert", name: NAME, aktiv_wo: { kind: "skipped" } },
      { kind: "outcome", outcome: "alumnus" },
    ],
    [
      "alumnus with a city",
      { typ: "studiert", name: NAME, aktiv_wo: { kind: "city", city: "Köln" } },
      { kind: "outcome", outcome: "alumnus" },
    ],
    ["bdaj", { typ: "bdaj", name: NAME }, { kind: "outcome", outcome: "bdaj" }],
    ["supporter", { typ: "unterstuetzen", name: NAME }, { kind: "outcome", outcome: "foerderer" }],
  ];

  it.each(cases)("%s", (_label, answers, expected) => {
    expect(nextStep(FLOW, answers, ENV)).toEqual(expected);
  });
});

describe("nextStep — robustness", () => {
  it("asks again when an answer is invalid", () => {
    expect(nextStep(FLOW, { typ: "hacker", name: NAME }, ENV)).toEqual({
      kind: "question",
      question: "typ",
    });
  });

  it("ignores answers to questions the flow no longer has", () => {
    expect(nextStep(FLOW, { typ: "unterstuetzen", alte_frage: "x" }, ENV)).toEqual({
      kind: "question",
      question: "name",
    });
  });

  it("does not skip a skipped-but-required place", () => {
    expect(
      nextStep(FLOW, { typ: "studiere", name: NAME, studienort: { kind: "skipped" } }, ENV),
    ).toEqual({ kind: "question", question: "studienort" });
  });

  it("keeps the bdaj outcome even without a bdaj group — completion decides (spec §5.4)", () => {
    expect(nextStep(FLOW, { typ: "bdaj", name: NAME }, { ...ENV, bdajGroupId: null })).toEqual({
      kind: "outcome",
      outcome: "bdaj",
    });
  });
});

describe("walk", () => {
  it("records the visited questions in order", () => {
    const { path, step } = walk(
      FLOW,
      { typ: "studiere", name: NAME, studienort: { kind: "city", city: "Passau" } },
      ENV,
    );
    expect(path).toEqual(["typ", "name", "studienort"]);
    expect(step).toEqual({ kind: "outcome", outcome: "student_ohne_gruppe" });
  });

  it("ends the path at the open question", () => {
    expect(walk(FLOW, { typ: "studiert" }, ENV).path).toEqual(["typ", "name"]);
  });
});

describe("visibleOptions", () => {
  const typ = FLOW.questions["typ"]!;

  it("shows the bdaj card only when the bdaj group exists", () => {
    expect(visibleOptions(typ, ENV).map((o) => o.value)).toContain("bdaj");
    expect(visibleOptions(typ, { ...ENV, bdajGroupId: null }).map((o) => o.value)).not.toContain(
      "bdaj",
    );
  });

  it("returns nothing for non-choice questions", () => {
    expect(visibleOptions(FLOW.questions["name"]!, ENV)).toEqual([]);
  });
});
