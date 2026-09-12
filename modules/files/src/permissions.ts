import {
  canManageGroup,
  isAnyLocalBoardLead,
  isFederalBoard,
  type CurrentMember,
} from "@bdas/members";

import type { Folder } from "./types";

/**
 * May this member read the folder? (spec §11 taxonomy)
 *  members_all      → any active member
 *  group_members    → active member of that group
 *  local_board      → that group's board, or federal (canManageGroup covers both)
 *  federal_board    → federal only
 *  board_broadcast  → any group's Lead, or federal — the federal board's
 *                      central distribution folder to every local Vorstand
 */
export function canRead(folder: Folder, me: CurrentMember): boolean {
  const { member, grants } = me;
  switch (folder.scope) {
    case "members_all":
      return member?.status === "active";
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
 * May this member upload/delete/manage folders here?
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
export function canWrite(folder: Folder, me: CurrentMember): boolean {
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
