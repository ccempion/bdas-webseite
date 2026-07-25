import { describe, expect, it } from "vitest";

import * as surface from "./index";

describe("@bdas/profile public surface", () => {
  it("exports exactly the intended runtime symbols", () => {
    expect(Object.keys(surface).sort()).toEqual(
      [
        "ABSCHLUSSART_OPTIONS",
        "GEFUNDEN_DURCH_OPTIONS",
        "SONSTIGE",
        "SaveProfileFields",
        "UNIVERSITIES",
        "canViewProfile",
        "getProfile",
        "isKnownUniversity",
        "saveProfile",
      ].sort(),
    );
  });
});
