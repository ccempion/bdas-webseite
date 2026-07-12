import type { RosterStatus } from "@bdas/events-module";

/** A roster entry with identity resolved, ready for display or CSV export. */
export type RosterDisplayRow = {
  readonly registrationId: string;
  /** null for a guest (non-member) registration. */
  readonly memberId: string | null;
  readonly name: string;
  readonly email: string;
  /** True for a non-member guest registration. */
  readonly isGuest: boolean;
  readonly status: RosterStatus;
  readonly registeredAt: Date;
};

const STATUS_LABEL: Record<RosterStatus, string> = {
  confirmed: "Bestätigt",
  waitlisted: "Warteliste",
};

/** Serialize one cell. Two concerns:
 *  1. Formula injection — a cell beginning with `= + - @` (or a tab/CR) is
 *     treated as a formula by Excel/Sheets/Numbers. Member names are
 *     user-controlled with no charset restriction, so prefix a guard `'` to
 *     force text. 2. RFC-4180 quoting for embedded quote/comma/newline. */
function cell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /["\n,]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
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
