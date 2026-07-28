import Link from "next/link";

import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";
import { listGroups } from "@bdas/groups";
import { listGrouplessMembers, listOpenGroupChanges } from "@bdas/members";
import { getProfile } from "@bdas/profile";

import { requireFederalScope } from "../../../_dashboard/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ohne Gruppe" };

const days = (from: Date) =>
  Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000));

export default async function PoolPage() {
  const me = await requireFederalScope();
  const db = getDb();
  const actor = { userId: me.user.id, grants: me.grants };
  const profileFlagOn = isFlagOn("profile");

  const pool = await listGrouplessMembers(db, actor);
  const open = await listOpenGroupChanges(db, actor);
  // Every status: the second table must name dormant and archived groups too.
  const groups = await listGroups(db, {});
  const groupName = (id: string | null) =>
    id === null ? "keine Gruppe" : (groups.find((g) => g.id === id)?.name ?? "—");

  const rows = await Promise.all(
    pool.map(async (p) => ({
      ...p,
      uni: profileFlagOn ? ((await getProfile(db, p.member.userId))?.uni ?? "—") : "—",
    })),
  );

  return (
    <main className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-bdas-ink">Ohne Gruppe</h1>
          <p className="text-bdas-ink-body">
            {rows.length} {rows.length === 1 ? "Person" : "Personen"} ohne Gruppenzugehörigkeit.
            Name, Universität und Wartezeit — mehr nicht.
          </p>
        </div>

        <Card flat className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bdas-soft text-left text-bdas-ink-muted">
                <th className="p-3 font-semibold">Name</th>
                <th className="p-3 font-semibold">Universität</th>
                <th className="p-3 font-semibold">Im Verband seit</th>
                <th className="p-3 font-semibold">Art</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="p-3 text-bdas-ink-muted" colSpan={4}>
                    Niemand wartet zurzeit auf eine Gruppe.
                  </td>
                </tr>
              ) : (
                rows.map(({ member, registeredAt, uni }) => (
                  <tr key={member.id} className="border-b border-bdas-soft">
                    <td className="p-3">
                      {member.firstName[0]}. {member.lastName}
                    </td>
                    <td className="p-3">{uni}</td>
                    <td className="p-3">{days(registeredAt)} Tage</td>
                    <td className="p-3 text-bdas-ink-muted">
                      {member.status === "active" ? "Mitglied ohne Gruppe" : "Bewerber:in"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-semibold text-bdas-ink">Offene Bewerbungen (alle Gruppen)</h2>
          <p className="text-bdas-ink-body">
            Jede unentschiedene Bewerbung im Verband. Der einzige Weg zur Warteschlange einer
            Gruppe, die nicht mehr aktiv ist.
          </p>
        </div>

        <Card flat className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bdas-soft text-left text-bdas-ink-muted">
                <th className="p-3 font-semibold">Zielgruppe</th>
                <th className="p-3 font-semibold">Beworben am</th>
                <th className="p-3 font-semibold">Entscheidbar</th>
                <th className="p-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {open.length === 0 ? (
                <tr>
                  <td className="p-3 text-bdas-ink-muted" colSpan={4}>
                    Keine offenen Bewerbungen.
                  </td>
                </tr>
              ) : (
                open.map((r) => {
                  const slug = groups.find((g) => g.id === r.toGroupId)?.slug;
                  return (
                    <tr key={r.id} className="border-b border-bdas-soft">
                      <td className="p-3">{groupName(r.toGroupId)}</td>
                      <td className="p-3">{new Date(r.requestedAt).toLocaleDateString("de-DE")}</td>
                      <td className="p-3 text-bdas-ink-muted">
                        {r.canDecide ? "durch dich" : "durch den lokalen Vorstand"}
                      </td>
                      <td className="p-3">
                        {slug ? (
                          <Link
                            href={`/gruppe/${slug}/bewerbungen`}
                            className="text-bdas-red hover:underline"
                          >
                            Zur Warteschlange →
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </main>
  );
}
