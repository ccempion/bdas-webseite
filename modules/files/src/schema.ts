import { bigint, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

// Drizzle table definitions for query building. Authoritative DDL — FKs, CHECKs,
// the (scope, group_id) unique — lives in migrations/0001_init.sql.

export const folders = pgTable(
  "folders",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    scope: text("scope").notNull(),
    groupId: text("group_id"),
    parentId: text("parent_id"),
    depth: integer("depth").notNull().default(0),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (t) => ({
    // Authoritative DDL is in migrations; since 0003 this unique is partial
    // (roots only). Kept here only so Drizzle can build queries.
    scopeGroupUq: unique("folders_scope_group_uq").on(t.scope, t.groupId),
  }),
);

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    folderId: text("folder_id").notNull(),
    filename: text("filename").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pending"),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    folderIdx: index("files_folder_idx").on(t.folderId),
    statusIdx: index("files_status_idx").on(t.status),
  }),
);

export const fileAccessLog = pgTable(
  "file_access_log",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id"),
    memberId: text("member_id").notNull(),
    action: text("action").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fileIdx: index("file_access_log_file_idx").on(t.fileId),
    memberIdx: index("file_access_log_member_idx").on(t.memberId),
  }),
);
