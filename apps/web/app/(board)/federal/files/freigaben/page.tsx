import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import { listAllFolderGrants, listFolderTree } from "@bdas/files";
import { listGroups } from "@bdas/groups";
import { getMember, listMembers } from "@bdas/members";

import { requireFederalScope } from "../../../../_dashboard/session";
import { requireFilesFlag } from "../../../../_files/flag";
import { folderPathOptions } from "../../../../_files/folder-path";
import { FreigabeForm, type PersonOption } from "./FreigabeForm";
import { RevokeButton } from "./RevokeButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ordnerfreigaben" };

/**
 * Ordnerfreigaben für einzelne Personen (ADR 0047). Eine eigene Seite, weil der
 * Bundesvorstand fremde Mitgliederordner nicht öffnen, aber freigeben kann.
 */
export default async function FreigabenPage() {
  requireFilesFlag();
  const me = await requireFederalScope();
  const db = getDb();

  const [grants, tree, groups, partners] = await Promise.all([
    listAllFolderGrants(db, me),
    listFolderTree(db, me),
    listGroups(db, {}),
    listGroups(db, { kind: "affiliate" }),
  ]);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const folders = folderPathOptions(tree);
  const folderPath = new Map(folders.map((f) => [f.id, f.path]));

  const people: PersonOption[] = (
    await Promise.all(partners.map((g) => listMembers(db, { groupId: g.id, status: "active" })))
  )
    .flat()
    .map((m) => ({
      memberId: m.id,
      label: `${m.firstName} ${m.lastName} (${groupName.get(m.primaryGroupId ?? "") ?? "—"})`,
    }));

  const holders = new Map(
    await Promise.all(
      [...new Set(grants.map((g) => g.memberId))].map(
        async (id) => [id, await getMember(db, id)] as const,
      ),
    ),
  );
  const rows = grants.map((g) => {
    const m = holders.get(g.memberId);
    return {
      ...g,
      name: m ? `${m.firstName} ${m.lastName}` : "Unbekannt",
      group: m?.primaryGroupId ? (groupName.get(m.primaryGroupId) ?? "—") : "keine Gruppe",
      path: folderPath.get(g.folderId) ?? "—",
    };
  });

  return (
    <main className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-bdas-ink">Ordnerfreigaben</h1>
          <p className="text-bdas-ink-body">
            Einzelne Personen aus Partnerorganisationen, etwa dem BDAJ, bekommen hier Zugang zu
            einem Ordner. Mit Schreibrecht laden sie Dateien hoch und löschen ihre eigenen. Ordner
            anlegen oder fremde Dateien löschen können sie nicht.
          </p>
        </div>
        <Card flat className="p-4">
          <FreigabeForm people={people} folders={folders} />
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-bdas-ink">Offene Freigaben</h2>
        <Card flat className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bdas-soft text-left text-bdas-ink-muted">
                <th className="p-3 font-semibold">Person</th>
                <th className="p-3 font-semibold">Gruppe</th>
                <th className="p-3 font-semibold">Ordner</th>
                <th className="p-3 font-semibold">Recht</th>
                <th className="p-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="p-3 text-bdas-ink-muted" colSpan={5}>
                    Keine Freigaben.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={`${r.folderId}:${r.memberId}`} className="border-b border-bdas-soft">
                    <td className="p-3 text-bdas-ink">{r.name}</td>
                    <td className="p-3">{r.group}</td>
                    <td className="p-3">{r.path}</td>
                    <td className="p-3">{r.canWrite ? "Lesen und hochladen" : "Lesen"}</td>
                    <td className="p-3 text-right">
                      <RevokeButton
                        folderId={r.folderId}
                        memberId={r.memberId}
                        label={`${r.name}, ${r.path}`}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </main>
  );
}
