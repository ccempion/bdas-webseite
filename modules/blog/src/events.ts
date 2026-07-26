/**
 * Typed events emitted by the blog module (CLAUDE.md §3). Other modules react
 * via `core/events` without importing blog internals — e.g. notifications
 * announces a report to the federal board.
 */
import type { PostVisibility } from "./types";

export type PostPublished = {
  readonly type: "blog.post.published";
  readonly postId: string;
  readonly slug: string;
  readonly visibility: PostVisibility;
  readonly authorId: string;
  readonly at: Date;
};

export type PostUpdated = {
  readonly type: "blog.post.updated";
  readonly postId: string;
  readonly at: Date;
};

export type PostDeleted = {
  readonly type: "blog.post.deleted";
  readonly postId: string;
  readonly at: Date;
};

export type PostReported = {
  readonly type: "blog.post.reported";
  readonly postId: string;
  readonly reporterId: string;
  readonly reason: string | null;
  readonly at: Date;
};

export type BlogEvent = PostPublished | PostUpdated | PostDeleted | PostReported;
