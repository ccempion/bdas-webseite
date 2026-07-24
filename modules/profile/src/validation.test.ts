import { describe, expect, it } from "vitest";

import { SaveProfileFields } from "./types";

const valid = {
  studiengang: "Informatik",
  abschlussart: "bachelor",
  uni: "Universität zu Köln",
  geburtsdatum: "2000-05-01",
  gefundenDurch: "webseite",
};

describe("SaveProfileFields", () => {
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
