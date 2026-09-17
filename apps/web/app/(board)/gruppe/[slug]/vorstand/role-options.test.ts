import { describe, expect, it } from "vitest";

import { delegateRoles } from "./role-options";

describe("delegateRoles", () => {
  it("bietet auf einer Hochschulgruppe alle vier Rollen an", () => {
    expect(delegateRoles("hochschulgruppe").map((r) => r.role)).toEqual([
      "event_organizer",
      "page_editor",
      "file_manager",
      "blogger",
    ]);
  });

  it("bietet auf einer Partnerorganisation nur Event-Manager und Blogger an (ADR 0047)", () => {
    expect(delegateRoles("affiliate").map((r) => r.option)).toEqual(["Event-Manager", "Blogger"]);
    expect(delegateRoles("netzwerk").map((r) => r.role)).toEqual(["event_organizer", "blogger"]);
  });
});
