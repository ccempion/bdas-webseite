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
};

const STATUS_TEXT: Record<MemberStatus, string> = {
  pending: "Bewerbung eingereicht",
  active: "Aktives Mitglied",
  inactive: "Inaktiv",
  alumnus: "Alumnus",
};

/** Roles a member always has by virtue of their status. A chip saying
 *  "Mitglied" tells them nothing they did not already know. */
const IMPLICIT_ROLES = new Set(["member", "alumnus"]);

export function layoutMode(status: MemberStatus | null): AccountLayoutMode {
  return status === "active" ? "full" : "plain";
}

export function buildIdentityRows(input: IdentityInput): IdentityRow[] {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Status", value: input.status ? STATUS_TEXT[input.status] : null },
    { label: "Gruppe", value: input.groupName },
    {
      label: "Mitglied seit",
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
