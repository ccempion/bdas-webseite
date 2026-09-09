import type { SubscriberRow } from "@bdas/newsletter";

const HEADER = [
  "email",
  "status",
  "source",
  "source_path",
  "group",
  "has_account",
  "created_at",
  "confirmed_at",
] as const;

/** Serialize one cell, same two rules as `roster-csv`: guard a formula-leading
 *  value with `'` so a spreadsheet treats it as text, then RFC-4180 quote when
 *  the value carries a quote, comma, or newline. */
function cell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /["\n,]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

const iso = (d: Date | null): string => (d === null ? "" : d.toISOString());

/**
 * The subscriber list as a file a spreadsheet can read. Pure — no DB, no I/O.
 *
 * Machine-readable values throughout (`subscribed`, not "Abonniert"): the
 * headers are field names, and a file that gets filtered and pivoted is better
 * off with the stable enum than with a label that changes when the UI copy does.
 *
 * `group` is the person's CURRENT group, passed in resolved by account id —
 * not `SubscriberRow.groupId`, which is the provenance of the signup (spec §4)
 * and would put a column of foreign keys in front of a board member.
 */
export function subscribersToCsv(
  rows: ReadonlyArray<SubscriberRow>,
  groupByUserId: ReadonlyMap<string, string>,
): string {
  const lines = [HEADER.map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.email,
        r.status,
        r.source,
        r.sourcePath ?? "",
        (r.userId === null ? undefined : groupByUserId.get(r.userId)) ?? "",
        String(r.userId !== null),
        iso(r.createdAt),
        iso(r.confirmedAt),
      ]
        .map(cell)
        .join(","),
    );
  }
  // The BOM is what makes Excel on Windows read this as UTF-8; without it an
  // address with an umlaut arrives as `mÃ¼ller@…`.
  return `﻿${lines.join("\r\n")}\r\n`;
}
