/**
 * Event times are German wall-clock time. Browsers submit `datetime-local`
 * strings without a zone and the runtime TZ is UTC on Vercel, so we convert
 * explicitly through Europe/Berlin. DST is handled by the IANA tz database via
 * `Intl` — no hard-coded offsets, correct across the CET/CEST switch.
 */
const TZ = "Europe/Berlin";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function berlinParts(at: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(at)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out;
}

/** Offset of Europe/Berlin at the given instant, in minutes (+120 for CEST). */
function berlinOffsetMinutes(at: Date): number {
  const p = berlinParts(at);
  const asUtc = Date.UTC(
    p["year"]!,
    p["month"]! - 1,
    p["day"]!,
    p["hour"]!,
    p["minute"]!,
    p["second"]!,
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Interpret a "YYYY-MM-DDTHH:mm" wall-time string as Europe/Berlin → UTC instant. */
export function berlinLocalToUtc(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // Apply the offset, then re-check once at the resulting instant so DST
  // boundaries (where the guess and the true instant differ) resolve correctly.
  let utc = guess - berlinOffsetMinutes(new Date(guess)) * 60000;
  const refined = guess - berlinOffsetMinutes(new Date(utc)) * 60000;
  if (refined !== utc) utc = refined;
  return new Date(utc);
}

/** Format a UTC instant as the Europe/Berlin "YYYY-MM-DDTHH:mm" for `datetime-local` inputs. */
export function utcToBerlinLocalInput(d: Date): string {
  const p = berlinParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p["year"]}-${pad(p["month"]!)}-${pad(p["day"]!)}T${pad(p["hour"]!)}:${pad(p["minute"]!)}`;
}
