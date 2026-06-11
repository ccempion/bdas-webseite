import { canManageGroup, isFederalBoard, type CurrentMember } from "@bdas/members";

import type { Folder } from "./types";

/**
 * May this member read the folder? (spec §11 taxonomy)
 *  members_all   → any active member
 *  group_members → active member of that group
 *  local_board   → that group's board, or federal (canManageGroup covers both)
 *  federal_board → federal only
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
  }
}

/**
 * May this member upload/delete in the folder?
 *  members_all / federal_board → federal only
 *  group_members / local_board → that group's board (federal included)
 */
export function canWrite(folder: Folder, me: CurrentMember): boolean {
  const { grants } = me;
  switch (folder.scope) {
    case "members_all":
    case "federal_board":
      return isFederalBoard(grants);
    case "group_members":
    case "local_board":
      return canManageGroup(grants, folder.groupId);
  }
}
