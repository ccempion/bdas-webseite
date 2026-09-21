import { describe, expect, it } from "vitest";

import { isValidAnswer, placeOf, sanitizeAnswers } from "./answers";
import type { Flow, FlowEnv, Question } from "./types";

const choice: Question = {
  kind: "choice",
  title: "t",
  help: "h",
  options: [{ value: "a", label: "A", hint: "", icon: "herz" }],
};
const name: Question = { kind: "name", title: "t", help: "h" };
const place: Question = { kind: "place", title: "t", help: "h", skippable: false, noGroupHint: "" };
const skippablePlace: Question = { ...place, skippable: true };

const FLOW: Flow = {
  version: 1,
  start: "c",
  questions: { c: choice, n: name, p: place, studienort: place, gruppenwahl: place },
  rules: [],
  outcomes: {} as Flow["outcomes"],
};

const ENV: FlowEnv = {
  groups: [{ id: "grp_ber", name: "BDAS Berlin", city: "Berlin" }],
  bdajGroupId: null,
  netzwerkGroupId: null,
};

describe("isValidAnswer", () => {
  it("accepts only declared choice values", () => {
    expect(isValidAnswer(choice, "a")).toBe(true);
    expect(isValidAnswer(choice, "b")).toBe(false);
    expect(isValidAnswer(choice, 1)).toBe(false);
  });

  it("requires both names, non-blank and within the cap", () => {
    expect(isValidAnswer(name, { firstName: "Lea", lastName: "Yıldız" })).toBe(true);
    expect(isValidAnswer(name, { firstName: " ", lastName: "Y" })).toBe(false);
    expect(isValidAnswer(name, { firstName: "Lea" })).toBe(false);
    expect(isValidAnswer(name, { firstName: "x".repeat(121), lastName: "Y" })).toBe(false);
  });

  it("accepts a group or a city, and skipping only where allowed", () => {
    expect(isValidAnswer(place, { kind: "group", groupId: "grp_ber" })).toBe(true);
    expect(isValidAnswer(place, { kind: "city", city: "Passau" })).toBe(true);
    expect(isValidAnswer(place, { kind: "city", city: "  " })).toBe(false);
    expect(isValidAnswer(place, { kind: "skipped" })).toBe(false);
    expect(isValidAnswer(skippablePlace, { kind: "skipped" })).toBe(true);
    expect(isValidAnswer(place, { kind: "group", groupId: "" })).toBe(false);
  });
});

describe("sanitizeAnswers", () => {
  it("drops unknown questions and invalid values, trims text", () => {
    const clean = sanitizeAnswers(FLOW, {
      c: "a",
      weg: "x",
      n: { firstName: "  Lea ", lastName: " Yıldız  ", extra: 1 },
      p: { kind: "skipped" },
    });
    expect(clean).toEqual({ c: "a", n: { firstName: "Lea", lastName: "Yıldız" } });
  });

  it("returns an empty object for non-objects", () => {
    expect(sanitizeAnswers(FLOW, null)).toEqual({});
    expect(sanitizeAnswers(FLOW, "x")).toEqual({});
    expect(sanitizeAnswers(FLOW, [1])).toEqual({});
  });

  it("keeps only the fields of a place answer", () => {
    const clean = sanitizeAnswers(FLOW, {
      p: { kind: "city", city: " Passau ", groupId: "grp_x" },
    });
    expect(clean).toEqual({ p: { kind: "city", city: "Passau" } });
  });
});

describe("placeOf", () => {
  it("resolves a known group to its name and city", () => {
    expect(placeOf(FLOW, { p: { kind: "group", groupId: "grp_ber" } }, ENV)).toEqual({
      groupId: "grp_ber",
      groupName: "BDAS Berlin",
      city: "Berlin",
    });
  });

  it("does not trust a group id the environment does not know", () => {
    expect(placeOf(FLOW, { p: { kind: "group", groupId: "grp_fremd" } }, ENV)).toEqual({
      groupId: null,
      groupName: null,
      city: null,
    });
  });

  it("returns the typed city without a group", () => {
    expect(placeOf(FLOW, { p: { kind: "city", city: "Passau" } }, ENV)).toEqual({
      groupId: null,
      groupName: null,
      city: "Passau",
    });
  });

  it("is empty without a place answer", () => {
    expect(placeOf(FLOW, { c: "a" }, ENV)).toEqual({ groupId: null, groupName: null, city: null });
  });
});

describe("sanitizeAnswers für group_choice", () => {
  const flow = {
    version: 1,
    start: "wahl",
    questions: {
      wahl: { kind: "group_choice" as const, title: "Welche Gruppe?", help: "Such dir eine aus." },
    },
    rules: [{ from: "wahl", to: { outcome: "student" as const } }],
    outcomes: FLOW.outcomes,
  };

  it("nimmt eine Gruppen-Antwort an", () => {
    expect(sanitizeAnswers(flow, { wahl: { kind: "group", groupId: "grp_1" } })).toEqual({
      wahl: { kind: "group", groupId: "grp_1" },
    });
  });

  it("verwirft Stadt und Überspringen", () => {
    expect(sanitizeAnswers(flow, { wahl: { kind: "city", city: "Köln" } })).toEqual({});
    expect(sanitizeAnswers(flow, { wahl: { kind: "skipped" } })).toEqual({});
  });
});

describe("placeOf mit mehreren Orts-Antworten", () => {
  const env = {
    groups: [{ id: "grp_koeln", name: "BDAS Köln", city: "Köln" }],
    bdajGroupId: null,
    netzwerkGroupId: null,
  };

  it("nimmt die gewählte Gruppe, nicht die vorher getippte Stadt", () => {
    const answers = {
      studienort: { kind: "city" as const, city: "Passau" },
      gruppenwahl: { kind: "group" as const, groupId: "grp_koeln" },
    };
    expect(placeOf(FLOW, answers, env)).toEqual({
      groupId: "grp_koeln",
      groupName: "BDAS Köln",
      city: "Köln",
    });
  });

  it("bleibt bei der Stadt, wenn keine Gruppe gewählt wurde", () => {
    const answers = { studienort: { kind: "city" as const, city: "Passau" } };
    expect(placeOf(FLOW, answers, env)).toEqual({
      groupId: null,
      groupName: null,
      city: "Passau",
    });
  });

  it("ignoriert eine Gruppen-ID, die der Server nicht kennt", () => {
    const answers = {
      studienort: { kind: "city" as const, city: "Passau" },
      gruppenwahl: { kind: "group" as const, groupId: "grp_erfunden" },
    };
    expect(placeOf(FLOW, answers, env)).toEqual({
      groupId: null,
      groupName: null,
      city: "Passau",
    });
  });
});
