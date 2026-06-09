const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "full", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export function formatDateTime(d: Date): string {
  return dateTime.format(d);
}

export function formatDate(d: Date): string {
  return dateOnly.format(d);
}
