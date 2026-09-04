import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const faqTopics = pgTable("faq_topics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
});

export const faqEntries = pgTable("faq_entries", {
  id: text("id").primaryKey(),
  section: text("section").notNull(),
  subgroup: text("subgroup"),
  topicId: text("topic_id").references(() => faqTopics.id, { onDelete: "set null" }),
  question: text("question").notNull(),
  body: jsonb("body").notNull(),
  youtubeId: text("youtube_id"),
  status: text("status").notNull().default("draft"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const faqEntryLinks = pgTable(
  "faq_entry_links",
  {
    entryId: text("entry_id")
      .notNull()
      .references(() => faqEntries.id, { onDelete: "cascade" }),
    relatedEntryId: text("related_entry_id")
      .notNull()
      .references(() => faqEntries.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.relatedEntryId] })],
);

export const faqEntryContexts = pgTable(
  "faq_entry_contexts",
  {
    entryId: text("entry_id")
      .notNull()
      .references(() => faqEntries.id, { onDelete: "cascade" }),
    context: text("context").notNull(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.context] })],
);

export const faqFeedback = pgTable(
  "faq_feedback",
  {
    entryId: text("entry_id")
      .notNull()
      .references(() => faqEntries.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    helpful: boolean("helpful").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.userId] })],
);

export const faqSubmissions = pgTable("faq_submissions", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  details: text("details"),
  context: text("context"),
  submittedBy: text("submitted_by").notNull(),
  status: text("status").notNull().default("open"),
  entryId: text("entry_id").references(() => faqEntries.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});
