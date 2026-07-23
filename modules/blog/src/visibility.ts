/**
 * Central, reusable visibility rules for blog posts (spec requirement 1).
 *
 * These are pure functions over a `Viewer` — no auth/db imports — so the same
 * predicate governs the feed SQL filter (`list.ts`), the single-post fetch
 * (`get.ts`), and the app-layer page/route guards. Never gate visibility in
 * the UI alone; every read path runs through here.
 *
 * Levels:
 *   - `public`  — everyone, including signed-out external visitors,
 *   - `members` — signed-in active members,
 *   - `board`   — federal board only ("Nur Vorstände").
 * The author always sees their own post regardless of level.
 */
import type { PostVisibility } from "./types";

/**
 * The reader's context. The app builds this from `getCurrentMember`
 * (see apps/web/lib/blog-viewer.ts); anonymous visitors pass `ANON`.
 */
export type Viewer = {
  /** Auth user id, or null for signed-out visitors. Gates author-sees-own. */
  readonly userId: string | null;
  /** Member with status 'active' → may see `members` posts. */
  readonly isMember: boolean;
  /** Federal board → may see `board` posts. */
  readonly isFederal: boolean;
};

export const ANON: Viewer = { userId: null, isMember: false, isFederal: false };

/**
 * Visibility levels a viewer may read, as a stored-value list for a SQL
 * `IN (...)` filter. Author-sees-own is NOT expressible here — the feed query
 * ORs in `created_by = viewer.userId` separately.
 */
export function visibleLevelsFor(v: Viewer): PostVisibility[] {
  const levels: PostVisibility[] = ["public"];
  if (v.isMember) levels.push("members");
  if (v.isFederal) levels.push("board");
  return levels;
}

/** Whether the viewer may see this specific post. */
export function canViewPost(
  v: Viewer,
  post: { readonly visibility: PostVisibility; readonly createdBy: string },
): boolean {
  if (v.userId !== null && post.createdBy === v.userId) return true; // author
  switch (post.visibility) {
    case "public":
      return true;
    case "members":
      return v.isMember;
    case "board":
      return v.isFederal;
  }
}

/**
 * Whether the viewer may edit/delete this post: the author, or federal board
 * (moderation). Creating a post only requires being signed in — that gate
 * lives at the app layer since it needs no post context.
 */
export function canModeratePost(v: Viewer, post: { readonly createdBy: string }): boolean {
  if (v.isFederal) return true;
  return v.userId !== null && post.createdBy === v.userId;
}
