import { getDb } from "@bdas/db";
import { folderFileCounts, listFolders } from "@bdas/files";
import { listGroups } from "@bdas/groups";

import { loadCurrentMember } from "../../../_dashboard/session";
import { requireFilesFlag } from "../../../_files/flag";
import { FolderIndex } from "../../../_files/FolderIndex";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dateien" };

export default async function FederalFilesPage() {
  requireFilesFlag();
  const db = getDb();
  const me = await loadCurrentMember();
  if (!me) return null; // the (board) layout already gated; this satisfies the type
  const [folders, groups] = await Promise.all([listFolders(db, me), listGroups(db)]);
  // listFolders returns the whole readable tree; the index shows roots only —
  // subfolders are reached by entering their parent.
  const roots = folders.filter((f) => f.parentId === null);
  const counts = await folderFileCounts(
    db,
    roots.map((f) => f.id),
    me,
  );
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Dateien</h1>
      <FolderIndex
        folders={roots}
        groupNames={groupNames}
        counts={counts}
        hrefBase="/federal/files"
      />
    </section>
  );
}
