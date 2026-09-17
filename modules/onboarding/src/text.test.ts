import { describe, expect, it } from "vitest";

import { FLOW } from "./flow";
import { fillText, placeholdersIn, textContext } from "./text";
import type { FlowEnv } from "./types";

const ENV: FlowEnv = {
  groups: [{ id: "grp_ber", name: "BDAS Berlin", city: "Berlin" }],
  bdajGroupId: null,
  netzwerkGroupId: null,
};

describe("placeholdersIn", () => {
  it("finds every braced name", () => {
    expect(placeholdersIn("Hallo {vorname}, {eingabe} und {quatsch}")).toEqual([
      "vorname",
      "eingabe",
      "quatsch",
    ]);
    expect(placeholdersIn("ohne")).toEqual([]);
  });
});

describe("textContext", () => {
  it("takes the first name and the resolved group", () => {
    const ctx = textContext(
      FLOW,
      {
        typ: "studiere",
        name: { firstName: "Lea", lastName: "Y" },
        studienort: { kind: "group", groupId: "grp_ber" },
      },
      ENV,
    );
    expect(ctx).toEqual({ vorname: "Lea", stadt: "Berlin", gruppe: "BDAS Berlin" });
  });

  it("falls back to neutral words when nothing is known", () => {
    expect(textContext(FLOW, {}, ENV)).toEqual({
      vorname: "",
      stadt: "deiner Stadt",
      gruppe: "deiner Gruppe",
    });
  });
});

describe("fillText", () => {
  const ctx = { vorname: "Lea", stadt: "Passau", gruppe: "deiner Gruppe" };

  it("replaces the known placeholders", () => {
    expect(fillText("Wo studierst du, {vorname}? In {stadt} bei {gruppe}.", ctx)).toBe(
      "Wo studierst du, Lea? In Passau bei deiner Gruppe.",
    );
  });

  it("fills {eingabe} from the third argument", () => {
    expect(fillText("In {eingabe} gibt es nichts.", ctx, "Passau")).toBe("In Passau gibt es nichts.");
  });

  it("leaves unknown placeholders alone", () => {
    expect(fillText("{quatsch}", ctx)).toBe("{quatsch}");
  });

  it("drops the comma when the first name is empty", () => {
    expect(fillText("Wo studierst du, {vorname}?", { ...ctx, vorname: "" })).toBe(
      "Wo studierst du?",
    );
  });
});
