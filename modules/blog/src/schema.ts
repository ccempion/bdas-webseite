import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { TiptapDoc } from "./types";

// Drizzle table definition for query building. The authoritative DDL — the
// visibility CHECK, the unique slug, defaults — lives in migrations/0001_init.sql
// and migrations/0002_categories_reports_softdelete.sql.

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    // Tiptap/ProseMirror JSON. Rendered to sanitized HTML at the app layer.
    content: jsonb("content").$type<TiptapDoc>().notNull(),
    visibility: text("visibility").notNull().default("public"),
    category: text("category").notNull().default("sonstiges"),
    // Soft-delete marker (spec 2026-07-26): moderation "delete" sets this
    // instead of removing the row. Every read path filters it out.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Auth user id of the author. Plain id, no FK (matches events).
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Feed is newest-first, visibility-filtered.
    feedIdx: index("posts_created_at_idx").on(t.createdAt),
    visibilityIdx: index("posts_visibility_idx").on(t.visibility),
    authorIdx: index("posts_author_idx").on(t.createdBy),
    categoryIdx: index("posts_category_idx").on(t.category),
  }),
);

export type PostRow = typeof posts.$inferSelect;

// A member's report against a post (spec 2026-07-26). Blog-owned per rule 1.
export const postReports = pgTable(
  "post_reports",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    reporterId: text("reporter_id").notNull(),
    reason: text("reason"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("post_reports_status_idx").on(t.status),
    postIdx: index("post_reports_post_id_idx").on(t.postId),
  }),
);

export type PostReportRow = typeof postReports.$inferSelect;

// A member's comment on a post (spec 2026-08-08). Blog-owned per rule 1.
export const postComments = pgTable(
  "post_comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    // Auth user id of the commenter. Plain id, no FK (matches posts.createdBy).
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Moderation soft delete. Every read path filters it out.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    postIdx: index("post_comments_post_idx").on(t.postId, t.createdAt),
    authorIdx: index("post_comments_author_idx").on(t.authorId, t.createdAt),
  }),
);

export type PostCommentRow = typeof postComments.$inferSelect;
