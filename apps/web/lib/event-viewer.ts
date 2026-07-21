import { ANON, type Viewer } from "@bdas/events-module";
import { isFederalBoard, type CurrentMember } from "@bdas/members";

/**
 * Map the session principal (`getCurrentMember`) to the events module's
 * visibility `Viewer`. Anonymous visitors get `ANON`.
 */
export function viewerFrom(me: CurrentMember | null): Viewer {
  if (!me) return ANON;
  return {
    isActiveMember: me.member?.status === "active",
    memberGroupIds: me.member?.primaryGroupId ? [me.member.primaryGroupId] : [],
    isFederal: isFederalBoard(me.grants),
    boardGroupIds: me.grants
      .filter((g) => (g.role === "local_board" || g.role === "local_board_lead") && g.groupId)
      .map((g) => g.groupId as string),
    organizerGroupIds: me.grants
      .filter((g) => g.role === "event_organizer" && g.groupId)
      .map((g) => g.groupId as string),
  };
}

/** Whether this viewer may manage any events at all (federal, local board of
 *  any group, or event organizer of any group). Mirrors the guard used by the
 *  /admin/events pages. */
export function canManageAny(v: Viewer): boolean {
  return v.isFederal || v.boardGroupIds.length > 0 || v.organizerGroupIds.length > 0;
}
