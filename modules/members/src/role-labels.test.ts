import { describe, expect, it } from "vitest";

import { isRole } from "./roles";
import { ROLE_LABELS } from "./types";

describe("ROLE_LABELS", () => {
  it("labels every role the auth module defines", () => {
    for (const key of Object.keys(ROLE_LABELS)) {
      expect(isRole(key), `${key} is not a Role`).toBe(true);
    }
    expect(Object.keys(ROLE_LABELS)).toHaveLength(8);
  });

  it("gives every role a non-empty German label", () => {
    for (const [role, label] of Object.entries(ROLE_LABELS)) {
      expect(label.trim(), `${role} has an empty label`).not.toBe("");
      expect(label, `${role} still reads like a key`).not.toMatch(/_/);
    }
  });

  it("keeps the labels the board views already show", () => {
    expect(ROLE_LABELS.federal_board).toBe("Bundesvorstand");
    expect(ROLE_LABELS.local_board_lead).toBe("Lead");
    expect(ROLE_LABELS.event_organizer).toBe("Organisator");
    expect(ROLE_LABELS.page_editor).toBe("Seiten-Editor");
  });

  it("labels the two roles introduced by the local role redesign", () => {
    expect(ROLE_LABELS.file_manager).toBe("Datei-Manager");
    expect(ROLE_LABELS.blogger).toBe("Blogger");
  });

  it("local_board is no longer a role and has no label", () => {
    expect(Object.keys(ROLE_LABELS)).not.toContain("local_board");
  });
});
