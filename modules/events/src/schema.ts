import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Drizzle table definitions for query building. The authoritative DDL — FKs,
// CHECKs, partial unique indexes — lives in migrations/0001_init.sql.

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    // null group_id = federation-wide event (federal board).
    groupId: text("group_id"),
    title: text("title").notNull(),
    descriptionMd: text("description_md"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    location: text("location"),
    locationUrl: text("location_url"),
    content: jsonb("content").$type<import("./types").EventContent>(),
    coverImageKey: text("cover_image_key"),
    summary: text("summary"),
    registrationDeadline: timestamp("registration_deadline", { withTimezone: true }),
    locationName: text("location_name"),
    locationAddress: text("location_address"),
    locationLat: doublePrecision("location_lat"),
    locationLng: doublePrecision("location_lng"),
    // null capacity = unlimited.
    capacity: integer("capacity"),
    visibility: text("visibility").notNull().default("members_only"),
    status: text("status").notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusStartsIdx: index("events_status_starts_idx").on(t.status, t.startsAt),
    groupIdx: index("events_group_idx").on(t.groupId),
  }),
);

export const eventRegistrations = pgTable("event_registrations", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  memberId: text("member_id").notNull(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  // null position = confirmed; >=1 = waitlisted at that rank.
  waitlistPosition: integer("waitlist_position"),
});

export const eventAttendance = pgTable("event_attendance", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  memberId: text("member_id").notNull(),
  attended: boolean("attended").notNull().default(false),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
  checkedInBy: text("checked_in_by"),
});

export type EventRow = typeof events.$inferSelect;
export type EventRegistrationRow = typeof eventRegistrations.$inferSelect;
