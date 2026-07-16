/**
 * @bdas/content — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to
 * other workspaces. Internal files are not importable.
 */

export { getPage, savePage } from "./services/pages";
export { PuckDataSchema } from "./types";
export type { ActorGrant, ContentActor, ContentPage, PageData } from "./types";
export type { ContentEvent, ContentPageSaved } from "./events";
