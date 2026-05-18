import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Alert, Button, Card } from "@bdas/design-system";
import { listGroups } from "@bdas/groups";
import { getCurrentMember, requireFederalBoard } from "@bdas/members";

import { requireAuthFlag } from "../../_auth/flag";
import { requireGroupsFlag } from "../../_groups/flag";
import { requireMembersFlag } from "../../_members/flag";
import { readSessionCookie } from "../../../lib/auth-cookie";

export const metadata = { title: "Gruppen verwalten" };

const STATUS_LABEL: Record<string, string> = {
  active: "Aktiv",
  dormant: "Ruhend",
  new: "Neu",
  archived: "Archiviert",
};

/**
 * Temporary federal-board group management per build plan §3.
 * The proper dashboard ships in Phase 3.
 */
export default async function AdminGruppenPage() {
  requireAuthFlag();
  requireMembersFlag();
  requireGroupsFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");
  requireFederalBoard(me);

  const groups = await listGroups(db);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-bdas-ink">Gruppen verwalten</h1>
          <p className="text-bdas-ink-body">
            Hochschulgruppen anlegen, bearbeiten und archivieren (Bundesvorstand).
          </p>
        </div>
        <Link href="/admin/gruppen/neu">
          <Button>Neue Gruppe</Button>
        </Link>
      </header>

      {groups.length === 0 ? (
        <Alert variant="info" title="Noch keine Gruppen">
          Lege die erste Hochschulgruppe an.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((g) => (
            <li key={g.id}>
              <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-bdas-ink">{g.name}</p>
                  <p className="text-sm text-bdas-ink-muted">
                    {g.city} · {STATUS_LABEL[g.status] ?? g.status} · /gruppen/{g.slug}
                  </p>
                </div>
                <Link href={`/admin/gruppen/${g.slug}/bearbeiten`}>
                  <Button variant="ghost" size="sm">
                    Bearbeiten
                  </Button>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
