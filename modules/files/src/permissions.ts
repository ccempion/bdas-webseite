import {
  canManageGroup,
  isAnyLocalBoardLead,
  isFederalBoard,
  type CurrentMember,
} from "@bdas/members";

import type { FileMeta, Folder } from "./types";

/** Ordner-ID → darf schreiben; die persönlichen Freigaben des Betrachters. */
export type FolderAccess = ReadonlyMap<string, boolean>;

const NO_ACCESS: FolderAccess = new Map();

/**
 * May this member read the folder? (spec §11 taxonomy)
 *  members_all      → BDAS members (ADR 0045) — not every accepted account —
 *                      plus the federal board, which fills the folder
 *  group_members    → active member of that group
 *  local_board      → that group's board, or federal (canManageGroup covers both)
 *  federal_board    → federal only
 *  board_broadcast  → any group's Lead, or federal — the federal board's
 *                      central distribution folder to every local Vorstand
 * A personal grant in `access` opens the folder on top of the scope rule
 * (Spec 2026-09-16 §5.3).
 */
export function canRead(folder: Folder, me: CurrentMember, access = NO_ACCESS): boolean {
  if (access.has(folder.id)) return true;
  const { member, grants } = me;
  switch (folder.scope) {
    case "members_all":
      // Mitglieder, nicht „aufgenommene Accounts": Förderer und
      // Partnerorganisationen haben hier nichts zu suchen (Spec 2026-09-16 §4).
      // Der Bundesvorstand befüllt den Ordner und muss ihn sehen, auch ohne
      // eigene Hochschulgruppe.
      return me.isBdasMember || isFederalBoard(grants);
    case "group_members":
      return member?.status === "active" && member.primaryGroupId === folder.groupId;
    case "local_board":
      return canManageGroup(grants, folder.groupId);
    case "federal_board":
      return isFederalBoard(grants);
    case "board_broadcast":
      return isFederalBoard(grants) || isAnyLocalBoardLead(grants);
  }
}

/**
 * May this member manage the folder — create, rename, delete subfolders, and
 * delete anyone's file? The scope rule alone; a personal grant never manages
 * (ADR 0047).
 *  members_all / federal_board / board_broadcast → federal only (nobody
 *                                  else may add to the distribution folder —
 *                                  local boards get read-only access)
 *  local_board                 → that group's Lead (federal included)
 *  group_members                → that group's Lead or federal, OR that
 *                                  group's file_manager (local role redesign —
 *                                  a Datei-Manager gets full write access, but
 *                                  ONLY to the members folder, never the board
 *                                  folder, never another group)
 */
export function canManage(folder: Folder, me: CurrentMember): boolean {
  const { grants } = me;
  switch (folder.scope) {
    case "members_all":
    case "federal_board":
    case "board_broadcast":
      return isFederalBoard(grants);
    case "local_board":
      return canManageGroup(grants, folder.groupId);
    case "group_members":
      return (
        canManageGroup(grants, folder.groupId) ||
        grants.some((g) => g.role === "file_manager" && g.groupId === folder.groupId)
      );
  }
}

/**
 * May this member upload here? Whoever manages the folder, plus a personal
 * grant with can_write (Spec 2026-09-16 §5.3).
 */
export function canWrite(folder: Folder, me: CurrentMember, access = NO_ACCESS): boolean {
  return access.get(folder.id) === true || canManage(folder, me);
}

/** What a member may do in one folder, as the pages need it. */
export type FolderRights = {
  readonly canUpload: boolean;
  readonly canManage: boolean;
};

export function folderRights(folder: Folder, me: CurrentMember, access = NO_ACCESS): FolderRights {
  return { canUpload: canWrite(folder, me, access), canManage: canManage(folder, me) };
}

/**
 * May this member delete this file? A manager deletes any file; an uploader
 * with write access only their own (ADR 0047).
 */
export function mayDeleteFile(
  rights: FolderRights,
  file: Pick<FileMeta, "uploadedBy">,
  me: CurrentMember,
): boolean {
  if (rights.canManage) return true;
  return rights.canUpload && me.member !== null && file.uploadedBy === me.member.id;
}
