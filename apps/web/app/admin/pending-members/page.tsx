import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { listGroups } from "@bdas/groups";
import { getCurrentMember, listPendingMembers, requireFederalBoard } from "@bdas/members";

import { requireAuthFlag } from "../../_auth/flag.js";
import { requireMembersFlag } from "../../_members/flag.js";
import { readSessionCookie } from "../../../lib/auth-cookie.js";
import { RowActions } from "./RowActions.js";

export const metadata = { title: "Pending-Mitglieder" };

/**
 * Temporary one-screen approval UI per build plan §3 Sprint 3.
 * The proper dashboard ships in Phase 3.
 */
export default async function PendingMembersPage() {
  requireAuthFlag();
  requireMembersFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");
  requireFederalBoard(me);

  const [pending, groups] = await Promise.all([
    listPendingMembers(db, { userId: me.user.id, effectiveRoles: me.effectiveRoles }),
    listGroups(db),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-bdas-ink">Pending-Mitglieder</h1>
        <p className="text-bdas-ink-body">
          Mitglieder mit eingereichtem Profil, die auf eine Entscheidung des Bundesvorstands warten.
        </p>
      </header>

      {pending.length === 0 ? (
        <Alert variant="info" title="Keine offenen Anträge">
          Alle Mitgliedsanträge sind bearbeitet.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-4">
          {pending.map((m) => {
            const group = m.primaryGroupId ? groupById.get(m.primaryGroupId) : undefined;
            return (
              <li key={m.id}>
                <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-bdas-ink">
                      {m.firstName} {m.lastName}
                    </p>
                    <p className="text-sm text-bdas-ink-muted">
                      {group ? `${group.name} (${group.city})` : "Keine Gruppe ausgewählt"}
                    </p>
                  </div>
                  <RowActions memberId={m.id} />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
