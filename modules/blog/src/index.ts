/**
 * @bdas/blog — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only the symbols re-exported here are visible to
 * other workspaces. Internal files (schema, slug) are not importable.
 */

// Services
export { createPost, updatePost, deletePost, PostInput, rowToPost } from "./services/manage";
export { listPosts, type ListPostsFilters } from "./services/list";
export { getPostBySlug, getPostById } from "./services/get";
export { reportPost, listOpenReports, countOpenReports, dismissReport } from "./services/report";
export {
  addComment,
  listComments,
  deleteComment,
  countCommentsByPost,
  deleteCommentsByAuthor,
} from "./services/comments";

// Rendering (server-side Tiptap → sanitized HTML)
export { renderPostContentHtml, plainTextToDoc } from "./content";

// Central visibility rules — reused by the app's page/route guards.
export {
  ANON,
  visibleLevelsFor,
  canViewPost,
  canModeratePost,
  canModerateComment,
  type Viewer,
} from "./visibility";

// Slug helpers (the app previews a post's URL before publish).
export { slugifyTitle } from "./slug";

// Types
export type {
  Post,
  PostSummary,
  PostVisibility,
  PostCategory,
  PostReportStatus,
  PostReport,
  Comment,
  TiptapDoc,
} from "./types";
export { CATEGORY_LABELS } from "./types";
export type {
  BlogEvent,
  PostPublished,
  PostUpdated,
  PostDeleted,
  PostReported,
  CommentCreated,
} from "./events";
