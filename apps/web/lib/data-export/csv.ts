export type Row = Readonly<Record<string, unknown>>;

function cell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = "";
  else if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /["\n\r,]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function rowsToCsv(columns: readonly string[], rows: readonly Row[]): string {
  const lines = [columns.map(cell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
