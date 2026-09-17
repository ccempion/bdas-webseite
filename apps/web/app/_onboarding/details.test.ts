import { describe, expect, it } from "vitest";

import { PROFILE_FIELD_SCHEMAS, SONSTIGE } from "@bdas/profile";

import {
  detailScreens,
  EMPTY_DETAILS,
  restoreDetails,
  summaryLines,
  toProfileFields,
  validateDetailScreen,
  type DetailValues,
} from "./details";

const student: DetailValues = {
  ...EMPTY_DETAILS,
  studienfachKategorie: "Ingenieurwissenschaften",
  studiengang: "Maschinenbau",
  abschlussart: "bachelor",
  uni: "RWTH Aachen",
  geburtsdatum: "2002-03-04",
  gefundenDurch: "instagram",
};

describe("detailScreens", () => {
  it("puts subject and degree on one screen for students", () => {
    expect(detailScreens("student").map((s) => s.id)).toEqual([
      "studienfach",
      "uni",
      "geburtsdatum",
      "gefundenDurch",
      "photo",
    ]);
    expect(detailScreens("student")[0]?.fields).toEqual(["studienfach", "abschlussart"]);
  });

  it("follows the field set of each type", () => {
    expect(detailScreens("alumnus").map((s) => s.id)).toEqual(["studienfach", "uni", "gefundenDurch"]);
    expect(detailScreens("foerderer").map((s) => s.id)).toEqual(["interesse", "gefundenDurch"]);
    expect(detailScreens("bdaj").map((s) => s.id)).toEqual(["bdajFunktion", "gefundenDurch"]);
  });

  it("says why on every screen and speaks in the past for alumni", () => {
    for (const t of ["student", "alumnus", "foerderer", "bdaj"] as const) {
      for (const s of detailScreens(t)) expect(s.why.length).toBeGreaterThan(10);
    }
    expect(detailScreens("alumnus")[0]?.title).toBe("Was hast du studiert?");
  });
});

describe("toProfileFields", () => {
  it("builds a valid student record", () => {
    const fields = toProfileFields("student", student);
    expect(fields).toMatchObject({ nutzertyp: "student", studiengang: "Maschinenbau" });
    expect(PROFILE_FIELD_SCHEMAS.student.safeParse(fields).success).toBe(true);
  });

  it("uses the free text behind Sonstige", () => {
    const fields = toProfileFields("alumnus", {
      ...student,
      studiengang: SONSTIGE,
      studiengangOther: " Bionik ",
      uni: SONSTIGE,
      uniOther: "Hochschule Irgendwo",
    });
    expect(fields).toMatchObject({ studiengang: "Bionik", uni: "Hochschule Irgendwo" });
    expect(fields).not.toHaveProperty("geburtsdatum");
  });

  it("sends only the type's own fields for supporters and bdaj", () => {
    expect(toProfileFields("foerderer", { ...student, interesse: "Kultur" })).toEqual({
      nutzertyp: "foerderer",
      interesse: "Kultur",
      gefundenDurch: "instagram",
      empfehlerName: null,
      vorstellung: null,
      photoStorageKey: null,
    });
    expect(toProfileFields("bdaj", { ...student, bdajFunktion: "mitglied" })).toMatchObject({
      nutzertyp: "bdaj",
      bdajFunktion: "mitglied",
    });
  });
});

describe("validateDetailScreen", () => {
  const [studium, uni] = detailScreens("student");

  it("reports only the errors of the current screen", () => {
    const errors = validateDetailScreen("student", uni!, { ...EMPTY_DETAILS, uni: "" });
    expect(Object.keys(errors)).toEqual(["uni"]);
  });

  it("requires the study category in the wizard", () => {
    const errors = validateDetailScreen("student", studium!, { ...student, studienfachKategorie: "" });
    expect(errors["studienfachKategorie"]).toBe("Bitte wähle einen Studienbereich.");
  });

  it("requires the free text behind Sonstige", () => {
    const errors = validateDetailScreen("student", studium!, {
      ...student,
      studiengang: SONSTIGE,
      studiengangOther: "",
    });
    expect(errors["studiengang"]).toBeTruthy();
  });

  it("passes a complete screen", () => {
    expect(validateDetailScreen("student", studium!, student)).toEqual({});
  });

  it("never blocks on the optional photo", () => {
    const photo = detailScreens("student").at(-1)!;
    expect(validateDetailScreen("student", photo, EMPTY_DETAILS)).toEqual({});
  });
});

describe("restoreDetails", () => {
  it("keeps known string fields and drops the rest", () => {
    expect(restoreDetails({ studiengang: "Jura", evil: "x", uni: 5 })).toEqual({
      ...EMPTY_DETAILS,
      studiengang: "Jura",
    });
    expect(restoreDetails(null)).toEqual(EMPTY_DETAILS);
  });
});

describe("summaryLines", () => {
  it("shows labels, not keys", () => {
    const [studium, , geburt, gefunden] = detailScreens("student");
    expect(summaryLines(studium!, student)).toEqual([
      "Ingenieurwissenschaften · Maschinenbau",
      "Bachelor",
    ]);
    expect(summaryLines(geburt!, student)).toEqual(["04.03.2002"]);
    expect(summaryLines(gefunden!, student)).toEqual(["Instagram"]);
  });

  it("names the bdaj function and marks a missing photo", () => {
    const [funktion] = detailScreens("bdaj");
    expect(summaryLines(funktion!, { ...EMPTY_DETAILS, bdajFunktion: "geschaeftsstelle" })).toEqual([
      "Geschäftsstelle",
    ]);
    expect(summaryLines(detailScreens("student").at(-1)!, EMPTY_DETAILS)).toEqual(["Kein Foto"]);
  });
});
