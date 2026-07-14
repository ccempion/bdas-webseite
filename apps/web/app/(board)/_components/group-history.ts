import type { GroupChangeRequest, Member } from "@bdas/members";

export type TimelineEntry = {
  readonly id: string;
  readonly at: Date;
  readonly fromGroupId: string | null;
  readonly toGroupId: string | null;
  readonly kind: "join" | "pending" | "approved" | "rejected" | "withdrawn";
};

/**
 * The member's group story, newest first. `requests` arrives newest-first from
 * getGroupChangeHistory. The federation join is not a request row — it is
 * derived from `joinedAt` and lands in whichever group the member was in before
 * their first recorded move.
 */
export function buildGroupTimeline(
  member: Member,
  requests: ReadonlyArray<GroupChangeRequest>,
): TimelineEntry[] {
  const entries: TimelineEntry[] = requests.map((r) => ({
    id: r.id,
    at: r.decidedAt ?? r.requestedAt,
    fromGroupId: r.fromGroupId,
    toGroupId: r.toGroupId,
    kind: r.status,
  }));

  if (member.joinedAt === null) return entries;

  const oldest = requests[requests.length - 1];
  const originalGroup = oldest ? oldest.fromGroupId : member.primaryGroupId;

  entries.push({
    id: `join_${member.id}`,
    at: member.joinedAt,
    fromGroupId: null,
    toGroupId: originalGroup,
    kind: "join",
  });

  return entries;
}
