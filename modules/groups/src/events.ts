/**
 * Events emitted by the groups module. Subscribers depend on the types,
 * not on the producing services. (CLAUDE.md §3.)
 */

export type GroupCreated = {
  readonly type: "groups.group.created";
  readonly groupId: string;
  readonly slug: string;
  readonly at: Date;
};

export type GroupUpdated = {
  readonly type: "groups.group.updated";
  readonly groupId: string;
  readonly slug: string;
  readonly at: Date;
};

export type GroupEvent = GroupCreated | GroupUpdated;
