import { getDb } from "@bdas/db";
import { folderFileCounts, listFolders } from "@bdas/files";
import { getGroupBySlug } from "@bdas/groups";

import { requireGroupScope } from "../../../../_dashboard/session";
import { requireFilesFlag } from "../../../../_files/flag";
import { FolderIndex } from "../../../../_files/FolderIndex";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dateien" };

export default async function GroupFilesPage({ params }: { params: { slug: string } }) {
  requireFilesFlag();
  const { me, groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const [folders, group] = await Promise.all([
    listFolders(db, me),
    getGroupBySlug(db, params.slug),
  ]);
  // listFolders returns the whole readable tree; the index shows roots only —
  // subfolders are reached by entering their parent.
  const groupFolders = folders.filter((f) => f.groupId === groupId && f.parentId === null);
  const counts = await folderFileCounts(
    db,
    groupFolders.map((f) => f.id),
    me,
  );
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Dateien</h1>
      <FolderIndex
        folders={groupFolders}
        groupNames={group ? { [group.id]: group.name } : {}}
        counts={counts}
        hrefBase={`/gruppe/${params.slug}/files`}
      />
    </section>
  );
}
