import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { canWriteFolder, folderFileCounts, listFiles, listFolders } from "@bdas/files";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { Breadcrumbs } from "../../_files/Breadcrumbs";
import { buildBreadcrumbs } from "../../_files/folder-path";
import { FileList } from "../../_files/FileList";
import { requireFilesFlag } from "../../_files/flag";
import { FolderAdminControls } from "../../_files/FolderAdminControls";
import { FolderIndex } from "../../_files/FolderIndex";
import { NewFolderButton } from "../../_files/NewFolderButton";
import { readSessionCookie } from "../../../lib/auth-cookie";

export const metadata = { title: "Ordner" };

export default async function DateiOrdnerPage({ params }: { params: { folderId: string } }) {
  requireFilesFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) notFound();

  // Only folders the member may read are returned; an unknown or forbidden id is
  // indistinguishable from missing here — no existence leak.
  const readable = await listFolders(db, me);
  const folder = readable.find((f) => f.id === params.folderId);
  if (!folder) notFound();

  const children = readable.filter((f) => f.parentId === folder.id);
  const [files, groups, counts] = await Promise.all([
    listFiles(db, params.folderId, me),
    listGroups(db),
    folderFileCounts(
      db,
      children.map((c) => c.id),
      me,
    ),
  ]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  const canWrite = canWriteFolder(folder, me);
  const trail = buildBreadcrumbs(readable, folder.id);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <Breadcrumbs trail={trail} hrefBase="/dateien" />
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold text-bdas-ink">{folder.name}</h1>
          {canWrite && folder.parentId !== null ? (
            <FolderAdminControls
              folderId={folder.id}
              name={folder.name}
              description={folder.description}
            />
          ) : null}
        </div>
        {folder.description ? <p className="text-bdas-ink-body">{folder.description}</p> : null}
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-bdas-ink">Unterordner</h2>
          {canWrite ? <NewFolderButton parentId={folder.id} /> : null}
        </div>
        <FolderIndex
          folders={children}
          groupNames={groupNames}
          counts={counts}
          hrefBase="/dateien"
          emptyLabel="Keine Unterordner."
        />
      </section>

      <FileList files={files} folderId={params.folderId} canWrite={false} />
    </main>
  );
}
