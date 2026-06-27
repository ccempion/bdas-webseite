/** Minimal RFC 5545 single-event serializer for "add to calendar" downloads. */
import type { EventItem } from "./types";

type IcsInput = Pick<
  EventItem,
  "id" | "title" | "summary" | "startsAt" | "endsAt" | "locationName" | "locationAddress"
>;

function fmt(d: Date): string {
  // UTC basic format: YYYYMMDDTHHMMSSZ
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function eventToIcs(ev: IcsInput): string {
  const end = ev.endsAt ?? ev.startsAt;
  const location = [ev.locationName, ev.locationAddress].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BDAS//Events//DE",
    "BEGIN:VEVENT",
    `UID:${ev.id}@bdas`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(ev.startsAt)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ...(ev.summary ? [`DESCRIPTION:${esc(ev.summary)}`] : []),
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
