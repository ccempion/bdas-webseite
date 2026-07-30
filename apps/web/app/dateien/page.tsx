import Link from "next/link";
import type { ReactNode } from "react";

import { getDb } from "@bdas/db";
import { Alert } from "@bdas/design-system";
import { folderFileCounts, listFolders } from "@bdas/files";
import { listGroups } from "@bdas/groups";
import { getCurrentMember, type CurrentMember } from "@bdas/members";

import { requireFilesFlag } from "../_files/flag";
import { FolderIndex } from "../_files/FolderIndex";
import { readSessionCookie } from "../../lib/auth-cookie";

export const metadata = { title: "Dateien" };

async function folderIndexFor(me: CurrentMember): Promise<ReactNode> {
  const db = getDb();
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
    <FolderIndex folders={roots} groupNames={groupNames} counts={counts} hrefBase="/dateien" />
  );
}

export default async function DateienPage() {
  requireFilesFlag();

  const me = await getCurrentMember(getDb(), readSessionCookie());

  let body: ReactNode;
  if (!me) {
    body = (
      <Alert variant="info">
        Bitte{" "}
        <Link href="/anmelden" className="text-bdas-red hover:underline">
          melde dich an
        </Link>
        , um deine Dateien zu sehen.
      </Alert>
    );
  } else if (!me.member) {
    body = (
      <Alert variant="info">
        Bitte{" "}
        <Link href="/account" className="text-bdas-red hover:underline">
          lege dein Profil an
        </Link>
        , um auf Dateien zuzugreifen.
      </Alert>
    );
  } else {
    body = await folderIndexFor(me);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-bdas-ink">Dateien</h1>
        <p className="text-bdas-ink-body">Dokumente, die dir zur Verfügung stehen.</p>
      </header>
      {body}
    </main>
  );
}
