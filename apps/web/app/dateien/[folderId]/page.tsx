import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { listFiles, listFolders } from "@bdas/files";
import { getCurrentMember } from "@bdas/members";

import { requireFilesFlag } from "../../_files/flag";
import { FileList } from "../../_files/FileList";
import { readSessionCookie } from "../../../lib/auth-cookie";

export const metadata = { title: "Ordner" };

export default async function DateiOrdnerPage({ params }: { params: { folderId: string } }) {
  requireFilesFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) notFound();

  // Only folders the member may read are returned; an unknown or forbidden id is
  // indistinguishable from missing here — no existence leak.
  const folder = (await listFolders(db, me)).find((f) => f.id === params.folderId);
  if (!folder) notFound();

  const files = await listFiles(db, params.folderId, me);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <Link href="/dateien" className="text-sm text-bdas-ink-muted hover:underline">
          ‹ Alle Ordner
        </Link>
        <h1 className="text-3xl font-semibold text-bdas-ink">{folder.name}</h1>
        {folder.description ? <p className="text-bdas-ink-body">{folder.description}</p> : null}
      </header>
      <FileList files={files} />
    </main>
  );
}
