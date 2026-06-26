import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { canWriteFolder, listFiles, listFolders } from "@bdas/files";

import { requireGroupScope } from "../../../../../_dashboard/session";
import { requireFilesFlag } from "../../../../../_files/flag";
import { FileList } from "../../../../../_files/FileList";

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

  const folder = (await listFolders(db, me)).find((f) => f.id === params.folderId);
  // Must exist, be readable, and belong to this group's scope.
  if (!folder || folder.groupId !== groupId) notFound();

  const files = await listFiles(db, params.folderId, me);

  return (
    <section className="flex flex-col gap-4">
      <Link
        href={`/gruppe/${params.slug}/files`}
        className="text-sm text-bdas-ink-muted hover:underline"
      >
        ‹ Alle Ordner
      </Link>
      <h1 className="text-2xl font-semibold text-bdas-ink">{folder.name}</h1>
      {folder.description ? <p className="text-bdas-ink-body">{folder.description}</p> : null}
      <FileList files={files} folderId={params.folderId} canWrite={canWriteFolder(folder, me)} />
    </section>
  );
}
