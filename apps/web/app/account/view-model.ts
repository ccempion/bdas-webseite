import type { Role } from "@bdas/auth";
import type { GroupKind } from "@bdas/groups";
import type { Grant, MemberStatus } from "@bdas/members";
import { ROLE_LABELS } from "@bdas/members";

/**
 * "full" = the designed two-column overview. "plain" = a single column at every
 * width: status line, then the profile record.
 *
 * Only an active member gets the full page (design spec §5). Every new sign-up
 * passes through "plain" on the way to active, so it is a live path, not a
 * dead branch — it has to be correct, it does not have to be designed.
 */
export type AccountLayoutMode = "full" | "plain";

export type IdentityRow = { label: string; value: string };
export type RoleChip = { label: string; accent: boolean };

export type IdentityInput = {
  status: MemberStatus | null;
  groupName: string | null;
  joinedAt: Date | null;
  kind: GroupKind | null;
  isBdasMember: boolean;
};

const STATUS_TEXT: Record<MemberStatus, string> = {
  pending: "Bewerbung eingereicht",
  active: "Aktives Mitglied",
};

/** Rollen, die jedes aktive Mitglied ohnehin hat. Ein Chip „Mitglied" sagt
 *  niemandem etwas Neues. `alumnus` steht seit ADR 0043 NICHT mehr hier: die
 *  Rolle ist ab dort eine ausdrücklich vergebene Kennzeichnung und damit die
 *  einzige Stelle, an der ein Mitglied sie über sich selbst erfährt. */
const IMPLICIT_ROLES: ReadonlySet<Role> = new Set<Role>(["member"]);

export function layoutMode(status: MemberStatus | null): AccountLayoutMode {
  return status === "active" ? "full" : "plain";
}

/**
 * Die Statuszeile der Identitätskarte. Aufgenommen heißt nicht Mitglied
 * (Spec 2026-09-16 §3.1): Förderer- und Partnerorganisations-Accounts heißen
 * beim Namen, jeder andere Aufgenommene ohne Mitgliedschaft wartet auf den
 * Beitritt zu einer Gruppe.
 */
export function statusText(
  status: MemberStatus | null,
  kind: GroupKind | null,
  isBdasMember: boolean,
): string | null {
  if (status === null) return null;
  if (status === "active" && !isBdasMember) {
    if (kind === "netzwerk") return "Förderer*in";
    if (kind === "affiliate") return "BDAJ-Mitglied";
    return "Warten auf Beitritt";
  }
  return STATUS_TEXT[status];
}

export function buildIdentityRows(input: IdentityInput): IdentityRow[] {
  // Die Netzwerk-Gruppe hat keine Seite und keine Mitglieder: sie gehört nicht
  // in die Karte. Wer kein Mitglied ist, ist auch nicht „Mitglied seit".
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Status", value: statusText(input.status, input.kind, input.isBdasMember) },
    { label: "Gruppe", value: input.kind === "netzwerk" ? null : input.groupName },
    {
      label: input.isBdasMember ? "Mitglied seit" : "Dabei seit",
      value: input.joinedAt
        ? input.joinedAt.toLocaleDateString("de-DE", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : null,
    },
  ];

  return rows.flatMap((r) => {
    const value = r.value?.trim() ?? "";
    return value === "" ? [] : [{ label: r.label, value }];
  });
}

/**
 * The member's granted authorities, as chips. Scope is deliberately dropped:
 * a member holding a role in two groups sees one chip, because the chip answers
 * "what may I do", not "where". Brand red marks the organizer role — an open,
 * active capability (CLAUDE.md §7).
 */
export function roleChips(grants: ReadonlyArray<Grant>): RoleChip[] {
  const seen = new Set<string>();
  const chips: RoleChip[] = [];

  for (const g of grants) {
    if (IMPLICIT_ROLES.has(g.role)) continue;
    const label = ROLE_LABELS[g.role];
    if (seen.has(label)) continue;
    seen.add(label);
    chips.push({ label, accent: g.role === "event_organizer" });
  }

  return chips;
}
