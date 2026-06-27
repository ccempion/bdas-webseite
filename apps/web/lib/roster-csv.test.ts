import { describe, expect, it } from "vitest";

import { rosterToCsv, type RosterDisplayRow } from "./roster-csv";

const row = (over: Partial<RosterDisplayRow>): RosterDisplayRow => ({
  registrationId: "ereg_1",
  memberId: "mem_1",
  name: "Mara Beispiel",
  email: "mara@example.org",
  status: "confirmed",
  registeredAt: new Date("2026-06-01T10:00:00.000Z"),
  ...over,
});

describe("rosterToCsv", () => {
  it("emits a header and one row per registration with German status labels", () => {
    const csv = rosterToCsv([
      row({}),
      row({ name: "Ali Yıldız", email: "ali@example.org", status: "waitlisted" }),
    ]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("Name,E-Mail,Status,Angemeldet am");
    expect(lines[1]).toBe("Mara Beispiel,mara@example.org,Bestätigt,2026-06-01T10:00:00.000Z");
    expect(lines[2]).toContain("Warteliste");
  });

  it("quotes cells containing commas, quotes, or newlines", () => {
    const csv = rosterToCsv([row({ name: 'Doe, "Jane"\nstreet' })]);
    expect(csv).toContain('"Doe, ""Jane""\nstreet"');
  });

  it("returns just the header for an empty roster", () => {
    expect(rosterToCsv([])).toBe("Name,E-Mail,Status,Angemeldet am\r\n");
  });

  it("neutralizes formula-leading cells against CSV injection", () => {
    const csv = rosterToCsv([
      row({ name: '=HYPERLINK("http://evil","x")', email: "+1@example.org" }),
    ]);
    // `=` cell gains a guard quote and is then RFC-quoted (contains a comma);
    // `+`-leading email is guarded too.
    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).toContain("'+1@example.org");
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/);
  });
});
