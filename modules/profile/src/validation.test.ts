import { describe, expect, it } from "vitest";

import {
  AlumnusProfileFields,
  BdajProfileFields,
  FIELD_SETS,
  FoerdererProfileFields,
  isNutzertyp,
  MAX_INTERESSE,
  MAX_VORSTELLUNG,
  SaveProfileFields,
} from "./types";

const valid = {
  studiengang: "Informatik",
  abschlussart: "bachelor",
  uni: "Universität zu Köln",
  geburtsdatum: "2000-05-01",
  gefundenDurch: "webseite",
};

describe("SaveProfileFields", () => {
  it("accepts a profile without a vorstellung — it is optional for every channel", () => {
    expect(SaveProfileFields.safeParse(valid).success).toBe(true);
    expect(SaveProfileFields.safeParse({ ...valid, vorstellung: "" }).success).toBe(true);
    expect(SaveProfileFields.safeParse({ ...valid, vorstellung: null }).success).toBe(true);
  });

  it("accepts a vorstellung on a channel that has no recommender", () => {
    const r = SaveProfileFields.safeParse({
      ...valid,
      gefundenDurch: "instagram",
      vorstellung: "Ich studiere im 3. Semester und will mich engagieren.",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a vorstellung past the length cap", () => {
    const r = SaveProfileFields.safeParse({
      ...valid,
      vorstellung: "x".repeat(MAX_VORSTELLUNG + 1),
    });
    expect(r.success).toBe(false);
  });

  it("accepts a vorstellung exactly at the cap", () => {
    const r = SaveProfileFields.safeParse({ ...valid, vorstellung: "x".repeat(MAX_VORSTELLUNG) });
    expect(r.success).toBe(true);
  });

  it("accepts a well-formed profile", () => {
    expect(SaveProfileFields.safeParse(valid).success).toBe(true);
  });

  it("rejects an unknown abschlussart", () => {
    const r = SaveProfileFields.safeParse({ ...valid, abschlussart: "habilitation" });
    expect(r.success).toBe(false);
  });

  it("rejects a future birth date", () => {
    const r = SaveProfileFields.safeParse({ ...valid, geburtsdatum: "2999-01-01" });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed birth date", () => {
    expect(SaveProfileFields.safeParse({ ...valid, geburtsdatum: "01.05.2000" }).success).toBe(
      false,
    );
  });

  it("accepts a free-text (Sonstige) university value", () => {
    const r = SaveProfileFields.safeParse({ ...valid, uni: "Hochschule Irgendwo" });
    expect(r.success).toBe(true);
  });

  it("rejects an empty university", () => {
    expect(SaveProfileFields.safeParse({ ...valid, uni: "  " }).success).toBe(false);
  });

  it("requires empfehlerName when gefundenDurch is empfehlung", () => {
    const r = SaveProfileFields.safeParse({ ...valid, gefundenDurch: "empfehlung" });
    expect(r.success).toBe(false);
  });

  it("accepts empfehlung with a name", () => {
    const r = SaveProfileFields.safeParse({
      ...valid,
      gefundenDurch: "empfehlung",
      empfehlerName: "Ayşe Y.",
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid calendar date Feb 30", () => {
    const r = SaveProfileFields.safeParse({ ...valid, geburtsdatum: "2020-02-30" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid calendar date Apr 31", () => {
    const r = SaveProfileFields.safeParse({ ...valid, geburtsdatum: "2021-04-31" });
    expect(r.success).toBe(false);
  });

  it("accepts valid leap day", () => {
    const r = SaveProfileFields.safeParse({ ...valid, geburtsdatum: "2000-02-29" });
    expect(r.success).toBe(true);
  });
});

describe("student: Studienfach-Kategorie", () => {
  it("accepts a known category and none at all", () => {
    expect(
      SaveProfileFields.safeParse({ ...valid, studienfachKategorie: "Ingenieurwissenschaften" })
        .success,
    ).toBe(true);
    expect(SaveProfileFields.safeParse({ ...valid, studienfachKategorie: null }).success).toBe(
      true,
    );
  });

  it("rejects an unknown category", () => {
    expect(
      SaveProfileFields.safeParse({ ...valid, studienfachKategorie: "Zauberei" }).success,
    ).toBe(false);
  });

  it("rejects a mismatching explicit type", () => {
    expect(SaveProfileFields.safeParse({ ...valid, nutzertyp: "alumnus" }).success).toBe(false);
  });
});

describe("AlumnusProfileFields", () => {
  const alumnus = { studiengang: "Jura", uni: "Universität zu Köln", gefundenDurch: "instagram" };

  it("needs no degree and no birth date", () => {
    expect(AlumnusProfileFields.safeParse(alumnus).success).toBe(true);
  });

  it("strips student-only fields instead of failing", () => {
    const r = AlumnusProfileFields.safeParse({ ...alumnus, abschlussart: "", geburtsdatum: "" });
    expect(r.success && !("abschlussart" in r.data)).toBe(true);
  });

  it("still needs subject, university and channel", () => {
    expect(AlumnusProfileFields.safeParse({ ...alumnus, uni: "" }).success).toBe(false);
    expect(AlumnusProfileFields.safeParse({ ...alumnus, studiengang: "" }).success).toBe(false);
    expect(AlumnusProfileFields.safeParse({ ...alumnus, gefundenDurch: "" }).success).toBe(false);
  });
});

describe("FoerdererProfileFields", () => {
  it("needs an interest within the cap", () => {
    const base = { gefundenDurch: "webseite" };
    expect(FoerdererProfileFields.safeParse({ ...base, interesse: "Kulturarbeit" }).success).toBe(
      true,
    );
    expect(FoerdererProfileFields.safeParse({ ...base, interesse: "  " }).success).toBe(false);
    expect(
      FoerdererProfileFields.safeParse({ ...base, interesse: "x".repeat(MAX_INTERESSE + 1) })
        .success,
    ).toBe(false);
  });
});

describe("BdajProfileFields", () => {
  it("accepts only the three functions", () => {
    const base = { gefundenDurch: "webseite" };
    expect(BdajProfileFields.safeParse({ ...base, bdajFunktion: "geschaeftsstelle" }).success).toBe(
      true,
    );
    expect(BdajProfileFields.safeParse({ ...base, bdajFunktion: "chef" }).success).toBe(false);
  });

  it("keeps the referral rule", () => {
    expect(
      BdajProfileFields.safeParse({ gefundenDurch: "empfehlung", bdajFunktion: "mitglied" })
        .success,
    ).toBe(false);
  });
});

describe("FIELD_SETS", () => {
  it("follows the spec order", () => {
    expect(FIELD_SETS).toEqual({
      student: ["studienfach", "abschlussart", "uni", "geburtsdatum", "gefundenDurch", "photo"],
      alumnus: ["studienfach", "uni", "gefundenDurch"],
      foerderer: ["interesse", "gefundenDurch"],
      bdaj: ["bdajFunktion", "gefundenDurch"],
    });
  });

  it("knows its types", () => {
    expect(isNutzertyp("alumnus")).toBe(true);
    expect(isNutzertyp("gast")).toBe(false);
  });
});
