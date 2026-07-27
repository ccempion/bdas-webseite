import { describe, expect, it } from "vitest";

import { buildProfileSummary, type SummaryInput } from "./profile-summary";

const complete: SummaryInput = {
  firstName: "Alina",
  lastName: "Berger",
  groupName: "BDAS Aachen (Aachen)",
  studiengang: "Wirtschaftsinformatik",
  abschlussart: "master",
  uni: "RWTH Aachen",
  geburtsdatum: "1999-01-02",
  gefundenDurch: "instagram",
  empfehlerName: null,
};

const rowsByLabel = (input: SummaryInput): Record<string, string> =>
  Object.fromEntries(buildProfileSummary(input).map((r) => [r.label, r.value]));

describe("buildProfileSummary", () => {
  it("resolves stored keys to their German labels", () => {
    const rows = rowsByLabel(complete);
    expect(rows["Abschlussart"]).toBe("Master");
    expect(rows["Gefunden durch"]).toBe("Instagram");
  });

  it("formats the birth date as de-DE", () => {
    expect(rowsByLabel(complete)["Geburtsdatum"]).toBe("02.01.1999");
  });

  it("passes an unparseable date through rather than rendering Invalid Date", () => {
    expect(rowsByLabel({ ...complete, geburtsdatum: "irgendwann" })["Geburtsdatum"]).toBe(
      "irgendwann",
    );
  });

  it("keeps the field order of the forms", () => {
    expect(buildProfileSummary(complete).map((r) => r.label)).toEqual([
      "Vorname",
      "Nachname",
      "BDAS-Gruppe",
      "Studiengang",
      "Abschlussart",
      "Hochschule",
      "Geburtsdatum",
      "Gefunden durch",
    ]);
  });

  it("drops empty and whitespace-only fields", () => {
    const rows = rowsByLabel({
      ...complete,
      groupName: null,
      studiengang: "   ",
      geburtsdatum: "",
    });
    expect(rows).not.toHaveProperty("BDAS-Gruppe");
    expect(rows).not.toHaveProperty("Studiengang");
    expect(rows).not.toHaveProperty("Geburtsdatum");
    expect(rows["Vorname"]).toBe("Alina");
  });

  it("shows the referrer only for gefundenDurch=empfehlung", () => {
    expect(rowsByLabel(complete)).not.toHaveProperty("Empfohlen von");
    expect(
      rowsByLabel({ ...complete, gefundenDurch: "empfehlung", empfehlerName: "Jonas Weber" })[
        "Empfohlen von"
      ],
    ).toBe("Jonas Weber");
  });

  it("omits the referrer row when empfehlung is chosen but no name is stored", () => {
    expect(
      rowsByLabel({ ...complete, gefundenDurch: "empfehlung", empfehlerName: null }),
    ).not.toHaveProperty("Empfohlen von");
  });

  it("falls back to the raw key when an option is unknown", () => {
    expect(rowsByLabel({ ...complete, abschlussart: "habilitation" })["Abschlussart"]).toBe(
      "habilitation",
    );
  });
});
