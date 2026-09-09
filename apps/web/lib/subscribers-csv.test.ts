import { describe, expect, it } from "vitest";

import type { SubscriberRow } from "@bdas/newsletter";

import { subscribersToCsv } from "./subscribers-csv";

const row = (over: Partial<SubscriberRow> = {}): SubscriberRow => ({
  id: "nls_1",
  email: "mara@example.org",
  status: "subscribed",
  source: "footer",
  sourcePath: "/",
  groupId: null,
  userId: null,
  createdAt: new Date("2026-06-01T10:00:00.000Z"),
  confirmedAt: new Date("2026-06-01T10:05:00.000Z"),
  ...over,
});

/** The BOM Excel needs; asserted separately so the line assertions stay
 *  readable. */
const BOM = "﻿";
const lines = (csv: string): string[] => csv.replace(BOM, "").trimEnd().split("\r\n");

describe("subscribersToCsv", () => {
  it("writes a header and one line per subscriber", () => {
    const csv = subscribersToCsv([row()], new Map());
    expect(lines(csv)[0]).toBe(
      "email,status,source,source_path,group,has_account,created_at,confirmed_at",
    );
    expect(lines(csv)[1]).toBe(
      "mara@example.org,subscribed,footer,/,,false,2026-06-01T10:00:00.000Z,2026-06-01T10:05:00.000Z",
    );
  });

  it("starts with a byte order mark, or Excel reads the umlauts as Latin-1", () => {
    const csv = subscribersToCsv([row({ email: "müller@example.org" })], new Map());
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toContain("müller@example.org");
  });

  it("resolves the group from the account, not from the stored provenance", () => {
    const csv = subscribersToCsv(
      [row({ userId: "u1", groupId: "grp_herkunft" })],
      new Map([["u1", "HG Aachen"]]),
    );
    expect(lines(csv)[1]).toContain(",HG Aachen,true,");
    expect(csv).not.toContain("grp_herkunft");
  });

  it("leaves the group empty for an account without one", () => {
    const csv = subscribersToCsv([row({ userId: "u_unknown" })], new Map());
    expect(lines(csv)[1]).toBe(
      "mara@example.org,subscribed,footer,/,,true,2026-06-01T10:00:00.000Z,2026-06-01T10:05:00.000Z",
    );
  });

  it("writes nulls as empty cells, never as the word null", () => {
    const csv = subscribersToCsv([row({ sourcePath: null, confirmedAt: null })], new Map());
    expect(lines(csv)[1]).toBe(
      "mara@example.org,subscribed,footer,,,false,2026-06-01T10:00:00.000Z,",
    );
    expect(csv).not.toContain("null");
  });

  it("quotes cells with a comma, a quote, or a newline and doubles the quotes", () => {
    const csv = subscribersToCsv([row({ userId: "u1" })], new Map([["u1", 'HG "A", B\nC']]));
    expect(csv).toContain('"HG ""A"", B\nC"');
  });

  it("neutralizes formula-leading cells", () => {
    const csv = subscribersToCsv([row({ email: "+49@example.org" })], new Map());
    expect(csv).toContain("'+49@example.org");
  });

  it("returns just the header for an empty list", () => {
    expect(subscribersToCsv([], new Map())).toBe(
      `${BOM}email,status,source,source_path,group,has_account,created_at,confirmed_at\r\n`,
    );
  });
});
