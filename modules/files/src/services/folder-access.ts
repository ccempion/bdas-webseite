/**
 * Ordnerfreigabe pro Person (Spec 2026-09-16 §5.3). Ergänzt die Scope-Regeln
 * um „diese Person darf in diesen Ordner" — der Weg, auf dem BDAJ-
 * Funktionär*innen an einzelnen Ordnern mitarbeiten, ohne Mitglied zu sein.
 * Vergeben, widerrufen und einsehen darf nur der Bundesvorstand.
 */
import { and, eq, isNull, sql } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@bdas/errors";
import { createId } from "@bdas/id";
import { getMember, isFederalBoard, type CurrentMember } from "@bdas/members";

import type { FolderAccess } from "../permissions";
import { folderMemberGrants, folders } from "../schema";

const EMPTY: FolderAccess = new Map();

function requireFederal(me: CurrentMember): { id: string } {
  if (!me.member || !isFederalBoard(me.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand gibt Ordner für einzelne Personen frei.");
  }
  return { id: me.member.id };
}

function openGrant(folderId: string, memberId: string) {
  return and(
    eq(folderMemberGrants.folderId, folderId),
    eq(folderMemberGrants.memberId, memberId),
    isNull(folderMemberGrants.revokedAt),
  );
}

/** Freigeben, oder eine offene Freigabe auf das neue `canWrite` setzen. */
export async function grantFolderAccess(
  db: Db,
  folderId: string,
  memberId: string,
  opts: { canWrite?: boolean },
  byMember: CurrentMember,
): Promise<void> {
  const actor = requireFederal(byMember);
  const folder = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);
  if (!folder[0]) throw new NotFoundError("Ordner nicht gefunden.");
  const member = await getMember(db, memberId);
  if (!member) throw new NotFoundError("Person nicht gefunden.");
  if (member.status !== "active") {
    throw new ValidationError("Erst aufnehmen, dann freigeben.");
  }

  const canWrite = opts.canWrite ?? false;
  await db
    .insert(folderMemberGrants)
    .values({ id: createId("fmg"), folderId, memberId, canWrite, grantedBy: actor.id })
    .onConflictDoUpdate({
      target: [folderMemberGrants.folderId, folderMemberGrants.memberId],
      targetWhere: isNull(folderMemberGrants.revokedAt),
      set: { canWrite },
    });
}

export async function revokeFolderAccess(
  db: Db,
  folderId: string,
  memberId: string,
  byMember: CurrentMember,
): Promise<void> {
  const actor = requireFederal(byMember);
  await db
    .update(folderMemberGrants)
    .set({ revokedAt: sql`now()`, revokedBy: actor.id })
    .where(openGrant(folderId, memberId));
}

export async function listFolderAccess(
  db: Db,
  folderId: string,
  byMember: CurrentMember,
): Promise<Array<{ memberId: string; canWrite: boolean }>> {
  requireFederal(byMember);
  return db
    .select({ memberId: folderMemberGrants.memberId, canWrite: folderMemberGrants.canWrite })
    .from(folderMemberGrants)
    .where(and(eq(folderMemberGrants.folderId, folderId), isNull(folderMemberGrants.revokedAt)));
}

/**
 * Die offenen Freigaben des Betrachters als Ordner-ID → darf schreiben, auf alle
 * Unterordner ausgedehnt: ein Unterordner ist lesbar und beschreibbar für
 * genau die, für die es sein Elternordner ist. Treffen mehrere Freigaben
 * denselben Ordner, gewinnt die weitere. Eine Freigabe wirkt nur für
 * aufgenommene Accounts.
 */
export async function loadFolderAccess(db: Db, viewer: CurrentMember): Promise<FolderAccess> {
  if (viewer.member?.status !== "active") return EMPTY;
  const memberId = viewer.member.id;
  const grants = await db
    .select({ folderId: folderMemberGrants.folderId, canWrite: folderMemberGrants.canWrite })
    .from(folderMemberGrants)
    .where(and(eq(folderMemberGrants.memberId, memberId), isNull(folderMemberGrants.revokedAt)));
  if (grants.length === 0) return EMPTY;

  const tree = await db.select({ id: folders.id, parentId: folders.parentId }).from(folders);
  const children = new Map<string, string[]>();
  for (const f of tree) {
    if (f.parentId === null) continue;
    children.set(f.parentId, [...(children.get(f.parentId) ?? []), f.id]);
  }

  const access = new Map<string, boolean>();
  for (const g of grants) {
    const stack = [g.folderId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (access.get(id) === true || (access.has(id) && !g.canWrite)) continue;
      access.set(id, g.canWrite);
      stack.push(...(children.get(id) ?? []));
    }
  }
  return access;
}
