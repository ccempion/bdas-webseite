/**
 * Events emitted by the profile module. Subscribers depend on the types, not
 * on the producing service (CLAUDE.md §3). `profile.completed` fires when
 * `completed_at` transitions null → set; `profile.updated` on later edits.
 */
export type ProfileCompleted = {
  readonly type: "profile.completed";
  readonly userId: string;
  readonly groupId: string | null;
  readonly at: Date;
};

export type ProfileUpdated = {
  readonly type: "profile.updated";
  readonly userId: string;
  readonly at: Date;
};

export type ProfileEvent = ProfileCompleted | ProfileUpdated;
