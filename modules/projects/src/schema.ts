import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Drizzle table definition for query building. The authoritative DDL — the FK,
// the status CHECK, defaults — lives in migrations/0001_init.sql.

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull(),
    title: text("title").notNull(),
    descriptionMd: text("description_md"),
    status: text("status").notNull().default("active"),
    topic: text("topic"),
    contact: text("contact"),
    // File ids stored via @bdas/files — references only, never bytes.
    artifactFileIds: jsonb("artifact_file_ids").$type<string[]>().notNull().default([]),
    adoptedFromProjectId: text("adopted_from_project_id"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupIdx: index("projects_group_idx").on(t.groupId),
    topicIdx: index("projects_topic_idx").on(t.topic),
  }),
);

export type ProjectRow = typeof projects.$inferSelect;
