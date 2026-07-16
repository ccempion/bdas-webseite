import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const contentPages = pgTable("content_pages", {
  slug: text("slug").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull(),
});

export type ContentPageRow = typeof contentPages.$inferSelect;
