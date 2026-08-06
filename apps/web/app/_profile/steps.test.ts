import { describe, expect, it } from "vitest";

import { resolveUni, validateStep, type WizardValues } from "./steps";

const base: WizardValues = {
  studiengang: "Informatik",
  abschlussart: "bachelor",
  uni: "Universität zu Köln",
  uniOther: "",
  primaryGroupId: "grp_1",
  geburtsdatum: "2000-05-01",
  gefundenDurch: "webseite",
  empfehlerName: "",
  vorstellung: "",
  photoStorageKey: null,
};

describe("validateStep", () => {
  it("passes the gefunden step with an empty vorstellung — it is optional", () => {
    expect(validateStep("gefunden", { ...base, vorstellung: "" })).toEqual({});
  });

  it("fails the gefunden step when the vorstellung is too long", () => {
    const errors = validateStep("gefunden", { ...base, vorstellung: "x".repeat(1001) });
    expect(Object.keys(errors)).toContain("vorstellung");
  });

  it("passes the studium step with valid input", () => {
    expect(validateStep("studium", base)).toEqual({});
  });

  it("blocks the studium step on empty studiengang", () => {
    expect(validateStep("studium", { ...base, studiengang: " " })).toHaveProperty("studiengang");
  });

  it("blocks uni_gruppe when no group is chosen", () => {
    expect(validateStep("uni_gruppe", { ...base, primaryGroupId: "" })).toHaveProperty(
      "primaryGroupId",
    );
  });

  it("blocks uni_gruppe when Sonstige is chosen but free text is empty", () => {
    expect(validateStep("uni_gruppe", { ...base, uni: "Sonstige", uniOther: "" })).toHaveProperty(
      "uni",
    );
  });

  it("blocks gefunden=empfehlung without a referrer name", () => {
    expect(validateStep("gefunden", { ...base, gefundenDurch: "empfehlung" })).toHaveProperty(
      "empfehlerName",
    );
  });

  it("photo and review steps always pass", () => {
    expect(validateStep("foto", { ...base, photoStorageKey: null })).toEqual({});
    expect(validateStep("review", base)).toEqual({});
  });
});

describe("validateStep isolates step scope", () => {
  it("does not surface another step's invalid field", () => {
    // geburtsdatum is invalid, but the studium step must still pass (it doesn't own it)
    expect(validateStep("studium", { ...base, geburtsdatum: "not-a-date" })).toEqual({});
    // studiengang is empty, but the uni_gruppe step must still pass
    expect(validateStep("uni_gruppe", { ...base, studiengang: "" })).toEqual({});
  });

  it("only reports the current step's own field even when multiple are invalid", () => {
    const errs = validateStep("uni_gruppe", { ...base, studiengang: "", uni: "", uniOther: "" });
    expect(Object.keys(errs)).toEqual(["uni"]); // studiengang (other step) must NOT leak in
  });
});

describe("resolveUni", () => {
  it("returns the free text when Sonstige is selected", () => {
    expect(resolveUni({ ...base, uni: "Sonstige", uniOther: "Hochschule X" })).toBe("Hochschule X");
  });
  it("returns the list value otherwise", () => {
    expect(resolveUni(base)).toBe("Universität zu Köln");
  });
});
