import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const groups = pgTable(
  "groups",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    university: text("university"),
    description: text("description"),
    contactEmail: text("contact_email"),
    instagramUrl: text("instagram_url"),
    websiteUrl: text("website_url"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ statusIdx: index("groups_status_idx").on(t.status) }),
);

export type GroupRow = typeof groups.$inferSelect;
