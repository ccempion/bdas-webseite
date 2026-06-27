// Events are German wall-clock time — always render in Europe/Berlin, not the
// runtime TZ (UTC on Vercel).
const TZ = "Europe/Berlin";
const dateTime = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: TZ,
});
const dateOnly = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: TZ });

export function formatDateTime(d: Date): string {
  return dateTime.format(d);
}

export function formatDate(d: Date): string {
  return dateOnly.format(d);
}
