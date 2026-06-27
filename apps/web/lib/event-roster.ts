import { getUserExport } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { listRegistrations } from "@bdas/events-module";
import { getMember } from "@bdas/members";

import type { RosterDisplayRow } from "./roster-csv";

/**
 * Load an event roster with identity resolved. The events module owns only
 * `memberId` (CLAUDE.md §1 rule 1), so name comes from `members` and email from
 * `auth` here at the app layer. Rosters are small, so the per-row lookups are
 * acceptable; `getUserExport` is reused as the contact source, matching the
 * notifications RecipientResolver (a dedicated `auth.getUserContact` is a noted
 * follow-up).
 */
export async function loadRoster(eventId: string): Promise<RosterDisplayRow[]> {
  const db = getDb();
  const rows = await listRegistrations(db, eventId);
  const out: RosterDisplayRow[] = [];
  for (const r of rows) {
    const member = await getMember(db, r.memberId);
    const name = member ? `${member.firstName} ${member.lastName}`.trim() : "—";
    const user = member ? await getUserExport(db, member.userId) : null;
    out.push({
      registrationId: r.registrationId,
      memberId: r.memberId,
      name,
      email: user?.email ?? "",
      status: r.status,
      registeredAt: r.registeredAt,
    });
  }
  return out;
}
