/** Minimal RFC 5545 single-event serializer for "add to calendar" downloads. */
import type { EventItem } from "./types";

type IcsInput = Pick<
  EventItem,
  "id" | "title" | "summary" | "startsAt" | "endsAt" | "locationName" | "locationAddress"
>;

const TZID = "Europe/Berlin";

// Static, DST-correct VTIMEZONE for Europe/Berlin (CET/CEST, last-Sunday rules).
// Lets calendars render the event in German local time and follow the DST switch.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const berlinParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZID,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Europe/Berlin wall-clock in basic format YYYYMMDDTHHMMSS (no Z); paired with TZID. */
function fmtBerlin(d: Date): string {
  const p: Record<string, string> = {};
  for (const part of berlinParts.formatToParts(d)) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  return `${p["year"]}${p["month"]}${p["day"]}T${p["hour"]}${p["minute"]}${p["second"]}`;
}

/** UTC basic format YYYYMMDDTHHMMSSZ (for DTSTAMP). */
function fmtUtc(d: Date): string {
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
    ...VTIMEZONE,
    "BEGIN:VEVENT",
    `UID:${ev.id}@bdas`,
    `DTSTAMP:${fmtUtc(new Date())}`,
    `DTSTART;TZID=${TZID}:${fmtBerlin(ev.startsAt)}`,
    `DTEND;TZID=${TZID}:${fmtBerlin(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ...(ev.summary ? [`DESCRIPTION:${esc(ev.summary)}`] : []),
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
