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
  };
}
