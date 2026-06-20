import { getDb } from "@bdas/db";
import { listFolders } from "@bdas/files";
import { listGroups } from "@bdas/groups";

import { loadCurrentMember } from "../../../_dashboard/session";
import { FoldersTable } from "../../_components/FoldersTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dateien" };

export default async function FederalFilesPage() {
  const db = getDb();
  const me = await loadCurrentMember();
  if (!me) return null; // the (board) layout already gated; this satisfies the type
  const [folders, groups] = await Promise.all([listFolders(db, me), listGroups(db)]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Dateien</h1>
      <FoldersTable folders={folders} groupNames={groupNames} />
    </section>
  );
}
