import { getDb } from "@bdas/db";
import { listFolders } from "@bdas/files";
import { getGroupBySlug } from "@bdas/groups";

import { requireGroupScope } from "../../../../_dashboard/session";
import { FoldersTable } from "../../../_components/FoldersTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dateien" };

export default async function GroupFilesPage({ params }: { params: { slug: string } }) {
  const { me, groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const [folders, group] = await Promise.all([
    listFolders(db, me),
    getGroupBySlug(db, params.slug),
  ]);
  const groupFolders = folders.filter((f) => f.groupId === groupId);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Dateien</h1>
      <FoldersTable folders={groupFolders} groupNames={group ? { [group.id]: group.name } : {}} />
    </section>
  );
}
