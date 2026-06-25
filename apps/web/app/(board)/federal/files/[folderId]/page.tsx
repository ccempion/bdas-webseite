import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { listFiles, listFolders } from "@bdas/files";

import { loadCurrentMember } from "../../../../_dashboard/session";
import { requireFilesFlag } from "../../../../_files/flag";
import { FileList } from "../../../../_files/FileList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ordner" };

export default async function FederalFolderPage({ params }: { params: { folderId: string } }) {
  requireFilesFlag();
  const db = getDb();
  const me = await loadCurrentMember();
  if (!me) return null; // the (board) layout already gated

  const folder = (await listFolders(db, me)).find((f) => f.id === params.folderId);
  if (!folder) notFound();

  const files = await listFiles(db, params.folderId, me);

  return (
    <section className="flex flex-col gap-4">
      <Link href="/federal/files" className="text-sm text-bdas-ink-muted hover:underline">
        ‹ Alle Ordner
      </Link>
      <h1 className="text-2xl font-semibold text-bdas-ink">{folder.name}</h1>
      {folder.description ? <p className="text-bdas-ink-body">{folder.description}</p> : null}
      <FileList files={files} />
    </section>
  );
}
