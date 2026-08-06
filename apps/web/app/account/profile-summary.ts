import { ABSCHLUSSART_OPTIONS, GEFUNDEN_DURCH_OPTIONS } from "@bdas/profile";

export type SummaryRow = { label: string; value: string };

export type SummaryInput = {
  firstName: string;
  lastName: string;
  groupName: string | null;
  studiengang: string;
  abschlussart: string;
  uni: string;
  geburtsdatum: string;
  gefundenDurch: string;
  empfehlerName: string | null;
  vorstellung: string | null;
};

const label = (options: ReadonlyArray<{ value: string; label: string }>, key: string): string =>
  options.find((o) => o.value === key)?.label ?? key;

/** yyyy-mm-dd as stored → de-DE. Anything unparseable is passed through rather
 *  than rendered as "Invalid Date". */
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * The read-only view of a member's own profile: stored enum keys resolved to
 * their German labels, empty fields dropped so the list never shows a dangling
 * label with nothing after it.
 */
export function buildProfileSummary(input: SummaryInput): SummaryRow[] {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Vorname", value: input.firstName },
    { label: "Nachname", value: input.lastName },
    { label: "BDAS-Gruppe", value: input.groupName },
    { label: "Studiengang", value: input.studiengang },
    {
      label: "Abschlussart",
      value: input.abschlussart ? label(ABSCHLUSSART_OPTIONS, input.abschlussart) : "",
    },
    { label: "Hochschule", value: input.uni },
    { label: "Geburtsdatum", value: input.geburtsdatum ? formatDate(input.geburtsdatum) : "" },
    {
      label: "Gefunden durch",
      value: input.gefundenDurch ? label(GEFUNDEN_DURCH_OPTIONS, input.gefundenDurch) : "",
    },
  ];

  if (input.gefundenDurch === "empfehlung") {
    rows.push({ label: "Empfohlen von", value: input.empfehlerName });
  }

  // Optional (#122) — an empty one is dropped by the filter below, so an
  // applicant who said nothing sees no empty row.
  rows.push({ label: "Vorstellung", value: input.vorstellung });

  return rows.flatMap((r) => {
    const value = r.value?.trim() ?? "";
    return value === "" ? [] : [{ label: r.label, value }];
  });
}
