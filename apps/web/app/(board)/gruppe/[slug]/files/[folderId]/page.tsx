import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { canWriteFolder, folderFileCounts, listFiles, listFolders } from "@bdas/files";
import { getGroupBySlug } from "@bdas/groups";

import { requireGroupScope } from "../../../../../_dashboard/session";
import { Breadcrumbs } from "../../../../../_files/Breadcrumbs";
import { buildBreadcrumbs } from "../../../../../_files/folder-path";
import { FileList } from "../../../../../_files/FileList";
import { requireFilesFlag } from "../../../../../_files/flag";
import { FolderAdminControls } from "../../../../../_files/FolderAdminControls";
import { FolderIndex } from "../../../../../_files/FolderIndex";
import { NewFolderButton } from "../../../../../_files/NewFolderButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ordner" };

export default async function GroupFolderPage({
  params,
}: {
  params: { slug: string; folderId: string };
}) {
  requireFilesFlag();
  const { me, groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const hrefBase = `/gruppe/${params.slug}/files`;

  const readable = await listFolders(db, me);
  const folder = readable.find((f) => f.id === params.folderId);
  // Must exist, be readable, and belong to this group's scope. A subfolder
  // inherits its parent's group_id, so this holds at every depth.
  if (!folder || folder.groupId !== groupId) notFound();

  const children = readable.filter((f) => f.parentId === folder.id);
  const [files, group, counts] = await Promise.all([
    listFiles(db, params.folderId, me),
    getGroupBySlug(db, params.slug),
    folderFileCounts(
      db,
      children.map((c) => c.id),
      me,
    ),
  ]);
  const canWrite = canWriteFolder(folder, me);

  return (
    <section className="flex flex-col gap-4">
      <Breadcrumbs trail={buildBreadcrumbs(readable, folder.id)} hrefBase={hrefBase} />
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold text-bdas-ink">{folder.name}</h1>
        {canWrite && folder.parentId !== null ? (
          <FolderAdminControls
            folderId={folder.id}
            name={folder.name}
            description={folder.description}
          />
        ) : null}
      </div>
      {folder.description ? <p className="text-bdas-ink-body">{folder.description}</p> : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-bdas-ink">Unterordner</h2>
          {canWrite ? <NewFolderButton parentId={folder.id} /> : null}
        </div>
        <FolderIndex
          folders={children}
          groupNames={group ? { [group.id]: group.name } : {}}
          counts={counts}
          hrefBase={hrefBase}
          emptyLabel="Keine Unterordner."
        />
      </div>

      <FileList files={files} folderId={params.folderId} canWrite={canWrite} />
    </section>
  );
}
