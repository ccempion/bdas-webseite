import type { GroupSummary } from "@bdas/groups";

export type GroupPin = {
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly lat: number;
  readonly lng: number;
};

/**
 * Public projection for the map. Deliberately excludes the location's
 * name/address — they are editor-facing only (spec: address hidden publicly).
 */
export function toPins(groups: readonly GroupSummary[]): GroupPin[] {
  return groups.flatMap((g) =>
    g.location
      ? [{ slug: g.slug, name: g.name, city: g.city, lat: g.location.lat, lng: g.location.lng }]
      : [],
  );
}
