import type { Role } from "@bdas/auth";

import type { SectionKey } from "../../content/faq";

/** A role grant as carried on the current member. groupId is unused here — the
 *  FAQ ordering only cares which roles a viewer holds, not their scope. */
export type FaqGrant = { readonly role: Role; readonly groupId: string | null };

export type OrderedSection = { readonly key: SectionKey; readonly defaultOpen: boolean };

/** The four sub-roles that make the `vorstand` section a viewer's primary one.
 *  Their strings double as the subgroup ids in content/faq/vorstand.ts. */
const VORSTAND_ROLES: ReadonlySet<Role> = new Set<Role>([
  "local_board_lead",
  "local_board",
  "event_organizer",
  "page_editor",
]);

/** Render order with `allgemein` always last; the primary section is hoisted to
 *  the front by {@link orderSections}. */
const BASE_ORDER: readonly SectionKey[] = ["bundesvorstand", "vorstand", "mitglieder", "allgemein"];

/**
 * The section most relevant to a viewer, by grant priority: federal board wins
 * over any local-board sub-role, which wins over a plain member. A viewer with
 * both federal and local grants is treated as federal (highest trust).
 */
export function primarySection(grants: readonly FaqGrant[]): SectionKey {
  const roles = new Set<Role>(grants.map((g) => g.role));
  if (roles.has("federal_board")) return "bundesvorstand";
  for (const r of roles) if (VORSTAND_ROLES.has(r)) return "vorstand";
  return "mitglieder";
}

/**
 * All four sections in render order: the viewer's primary section first and
 * open, the rest in {@link BASE_ORDER} with `allgemein` last. A plain member has
 * both `mitglieder` and `allgemein` open; anyone else only their primary.
 */
export function orderSections(grants: readonly FaqGrant[]): OrderedSection[] {
  const primary = primarySection(grants);
  const ordered: SectionKey[] = [primary, ...BASE_ORDER.filter((k) => k !== primary)];

  const open = new Set<SectionKey>([primary]);
  if (primary === "mitglieder") open.add("allgemein");

  return ordered.map((key) => ({ key, defaultOpen: open.has(key) }));
}

/**
 * The subgroup ids (role strings) inside the `vorstand` section that match the
 * viewer's own board grants, so the renderer can highlight and open them.
 */
export function highlightedVorstandSubgroups(grants: readonly FaqGrant[]): ReadonlySet<string> {
  return new Set(grants.map((g) => g.role).filter((r) => VORSTAND_ROLES.has(r)));
}
