import type { EventWithCounts } from "@bdas/events-module";

/** Synthetic chip key for federation-wide events (groupId === null). */
export const FEDERATION_KEY = "bundesweit";

export type OwnerChip = { key: string; label: string };
export type GroupInfo = { name: string; slug: string };

type HasGroup = Pick<EventWithCounts, "groupId">;

/** Distinct owners that actually appear in `events`. Group chips first, sorted
 *  by German name; the Bundesweit bucket last, only when some event is
 *  federation-wide. Unknown groupIds (no map entry) are skipped. */
export function deriveOwners(
  events: ReadonlyArray<HasGroup>,
  groupById: ReadonlyMap<string, GroupInfo>,
): OwnerChip[] {
  let hasFederation = false;
  const bySlug = new Map<string, string>(); // slug -> name
  for (const e of events) {
    if (e.groupId === null) {
      hasFederation = true;
      continue;
    }
    const g = groupById.get(e.groupId);
    if (g && !bySlug.has(g.slug)) bySlug.set(g.slug, g.name);
  }
  const chips: OwnerChip[] = [...bySlug.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "de"))
    .map(([slug, name]) => ({ key: slug, label: name }));
  if (hasFederation) chips.push({ key: FEDERATION_KEY, label: "Bundesweit" });
  return chips;
}

/** Parse a comma-separated `groups` param, discarding keys not in `valid`. */
export function parseSelected(
  param: string | undefined,
  valid: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  if (!param) return out;
  for (const raw of param.split(",")) {
    const key = raw.trim();
    if (key && valid.has(key)) out.add(key);
  }
  return out;
}

/** Empty selection ⇒ everything. Otherwise keep events whose owner is selected. */
export function filterByGroups<T extends HasGroup>(
  events: ReadonlyArray<T>,
  selected: ReadonlySet<string>,
  groupById: ReadonlyMap<string, GroupInfo>,
): ReadonlyArray<T> {
  if (selected.size === 0) return events;
  return events.filter((e) => {
    if (e.groupId === null) return selected.has(FEDERATION_KEY);
    const g = groupById.get(e.groupId);
    return g ? selected.has(g.slug) : false;
  });
}

/** Build the /events href for a given selection + past flag. */
export function buildHref(selected: ReadonlySet<string>, past: boolean): string {
  const params = new URLSearchParams();
  if (selected.size > 0) params.set("groups", [...selected].join(","));
  if (past) params.set("past", "1");
  const q = params.toString();
  return q ? `/events?${q}` : "/events";
}

/** Href that flips one chip in/out of the current selection (past preserved). */
export function toggleHref(
  chipKey: string,
  selected: ReadonlySet<string>,
  past: boolean,
): string {
  const next = new Set(selected);
  if (next.has(chipKey)) next.delete(chipKey);
  else next.add(chipKey);
  return buildHref(next, past);
}
