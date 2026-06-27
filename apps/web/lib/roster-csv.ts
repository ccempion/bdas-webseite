import type { RosterStatus } from "@bdas/events-module";

/** A roster entry with identity resolved, ready for display or CSV export. */
export type RosterDisplayRow = {
  readonly registrationId: string;
  readonly memberId: string;
  readonly name: string;
  readonly email: string;
  readonly status: RosterStatus;
  readonly registeredAt: Date;
};

const STATUS_LABEL: Record<RosterStatus, string> = {
  confirmed: "Bestätigt",
  waitlisted: "Warteliste",
};

/** RFC-4180-ish quoting: wrap in quotes and double internal quotes when the
 *  cell contains a quote, comma, or newline. */
function cell(value: string): string {
  return /["\n,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialize a roster to CSV with a header row. Pure — no DB, no I/O. */
export function rosterToCsv(rows: ReadonlyArray<RosterDisplayRow>): string {
  const header = ["Name", "E-Mail", "Status", "Angemeldet am"];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.name, r.email, STATUS_LABEL[r.status], r.registeredAt.toISOString()].map(cell).join(","),
    );
  }
  // Trailing newline so the file ends cleanly.
  return lines.join("\r\n") + "\r\n";
}
