import type { FlowGroup } from "@bdas/onboarding/client";

export const MIN_QUERY = 2;

const norm = (s: string): string => s.trim().toLocaleLowerCase("de");

/** Gleiche Stadt — oder ein längerer amtlicher Name derselben Stadt
 *  („Frankfurt am Main" zur Gruppe in „Frankfurt"). */
export function cityMatches(groupCity: string, city: string): boolean {
  const g = norm(groupCity);
  const c = norm(city);
  return c === g || c.startsWith(`${g} `);
}

export type PlaceHit = {
  readonly groupId: string;
  readonly label: string;
  readonly detail: string;
};

/** Treffer für „Wo studierst du?" (Spec §4.1). Hochschulen erscheinen nur,
 *  wenn es in ihrer Stadt eine aktive Gruppe gibt. */
export function searchPlaces(
  query: string,
  groups: ReadonlyArray<FlowGroup>,
  universities: ReadonlyArray<readonly [string, string]>,
  limit = 6,
): PlaceHit[] {
  const q = norm(query);
  if (q.length < MIN_QUERY) return [];

  const hits: PlaceHit[] = [];
  for (const g of groups) {
    if (norm(g.name).includes(q) || norm(g.city).includes(q)) {
      hits.push({ groupId: g.id, label: g.name, detail: `Aktive Hochschulgruppe · ${g.city}` });
    }
  }
  for (const [uni, city] of universities) {
    if (!norm(uni).includes(q)) continue;
    const g = groups.find((x) => cityMatches(x.city, city));
    if (g) hits.push({ groupId: g.id, label: uni, detail: g.name });
  }
  return hits.slice(0, limit);
}

export function groupInCity(city: string, groups: ReadonlyArray<FlowGroup>): FlowGroup | null {
  return groups.find((g) => cityMatches(g.city, city)) ?? null;
}
