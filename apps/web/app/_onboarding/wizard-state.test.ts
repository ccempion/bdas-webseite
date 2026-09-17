import { describe, expect, it } from "vitest";

import { FLOW, type FlowEnv } from "@bdas/onboarding";

import {
  canGoBack,
  currentOutcome,
  currentQuestion,
  INITIAL,
  partOf,
  reduce,
  type WizardAction,
  type WizardState,
} from "./wizard-state";

const ENV: FlowEnv = {
  groups: [{ id: "grp_ber", name: "BDAS Berlin", city: "Berlin" }],
  bdajGroupId: null,
  netzwerkGroupId: "grp_netz",
};
const NAME = { firstName: "Lea", lastName: "Y" };

const run = (...actions: WizardAction[]): WizardState =>
  actions.reduce((s, a) => reduce(FLOW, ENV, s, a), INITIAL);

describe("wizard-state", () => {
  it("starts at the first question", () => {
    expect(currentQuestion(FLOW, INITIAL, ENV)).toBe("typ");
    expect(canGoBack(FLOW, INITIAL, ENV)).toBe(false);
  });

  it("walks a student to the result", () => {
    const s = run(
      { type: "answer", question: "typ", value: "studiere" },
      { type: "answer", question: "name", value: NAME },
      { type: "answer", question: "studienort", value: { kind: "group", groupId: "grp_ber" } },
    );
    expect(s.stage).toBe("ergebnis");
    expect(currentOutcome(FLOW, s, ENV)).toBe("student");
  });

  it("stays on a question when the answer is invalid", () => {
    const s = run({ type: "answer", question: "name", value: { firstName: "", lastName: "" } });
    expect(s.stage).toBe("fragen");
    expect(currentQuestion(FLOW, s, ENV)).toBe("typ");
  });

  it("goes back without losing answers", () => {
    const s = run(
      { type: "answer", question: "typ", value: "unterstuetzen" },
      { type: "answer", question: "name", value: NAME },
      { type: "back" },
    );
    expect(s.stage).toBe("fragen");
    expect(currentQuestion(FLOW, s, ENV)).toBe("name");
    expect(s.answers["name"]).toEqual(NAME);

    const first = reduce(FLOW, ENV, s, { type: "back" });
    expect(currentQuestion(FLOW, first, ENV)).toBe("typ");
    expect(first.answers["typ"]).toBe("unterstuetzen");
    expect(reduce(FLOW, ENV, first, { type: "back" })).toEqual(first);
  });

  it("shows an already answered next question instead of skipping it", () => {
    const s = run(
      { type: "answer", question: "typ", value: "unterstuetzen" },
      { type: "answer", question: "name", value: NAME },
      { type: "change_type" },
      { type: "answer", question: "typ", value: "studiere" },
    );
    expect(currentQuestion(FLOW, s, ENV)).toBe("name");
  });

  it("goes to the account form only from a result, and back again", () => {
    expect(run({ type: "to_account" }).stage).toBe("fragen");
    const s = run(
      { type: "answer", question: "typ", value: "unterstuetzen" },
      { type: "answer", question: "name", value: NAME },
      { type: "to_account" },
    );
    expect(s.stage).toBe("konto");
    expect(partOf(s.stage)).toBe(2);
    expect(reduce(FLOW, ENV, s, { type: "back" }).stage).toBe("ergebnis");
  });

  it("forgets the answers once the mail is sent", () => {
    const s = run(
      { type: "answer", question: "typ", value: "unterstuetzen" },
      { type: "sent", email: "lea@example.org" },
    );
    expect(s).toEqual({ stage: "gesendet", answers: {}, cursor: null, email: "lea@example.org" });
    expect(canGoBack(FLOW, s, ENV)).toBe(false);
  });
});
