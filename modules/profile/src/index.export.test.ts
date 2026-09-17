import { describe, expect, it } from "vitest";

import * as surface from "./index";

describe("@bdas/profile public surface", () => {
  it("exports exactly the intended runtime symbols", () => {
    expect(Object.keys(surface).sort()).toEqual(
      [
        "ABSCHLUSSART_OPTIONS",
        "AlumnusProfileFields",
        "BDAJ_FUNKTION_OPTIONS",
        "BdajProfileFields",
        "FIELD_SETS",
        "FoerdererProfileFields",
        "GEFUNDEN_DURCH_OPTIONS",
        "MAX_INTERESSE",
        "MAX_VORSTELLUNG",
        "NUTZERTYPEN",
        "PROFILE_FIELD_SCHEMAS",
        "SONSTIGE",
        "STUDIENFACH_KATEGORIEN",
        "STUDIENFACH_KATEGORIE_NAMES",
        "SaveProfileFields",
        "StudentProfileFields",
        "UNIVERSITIES",
        "canViewProfile",
        "canonicalUniversity",
        "clearProfilePhoto",
        "faecherIn",
        "getProfile",
        "isNutzertyp",
        "saveProfile",
        "setProfilePhoto",
        "universityCity",
      ].sort(),
    );
  });
});
