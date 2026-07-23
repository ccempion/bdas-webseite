import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { TiptapDoc } from "./types";

// Drizzle table definition for query building. The authoritative DDL — the
// visibility CHECK, the unique slug, defaults — lives in migrations/0001_init.sql.

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    // Tiptap/ProseMirror JSON. Rendered to sanitized HTML at the app layer.
    content: jsonb("content").$type<TiptapDoc>().notNull(),
    visibility: text("visibility").notNull().default("public"),
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
  }),
);

export type PostRow = typeof posts.$inferSelect;
