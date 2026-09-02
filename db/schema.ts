import { boolean, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const eventStates = pgTable("event_states", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  publishedPayload: text("published_payload"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by"),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }),
  publishedBy: text("published_by"),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
  archivedBy: text("archived_by"),
});

export const roleTemplates = pgTable("role_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull().default(""),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#d8d2ef"),
  revision: integer("revision").notNull().default(1),
  mergedIntoId: text("merged_into_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by"),
});

export const rosterGroups = pgTable("roster_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#d8d2ef"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const rosterPeople = pgTable("roster_people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  initials: text("initials").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  color: text("color").notNull().default("#d8d2ef"),
  groupId: text("group_id"),
  preferences: text("preferences").notNull().default("[]"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const eventAvailability = pgTable("event_availability", {
  eventId: text("event_id").notNull(),
  personId: text("person_id").notNull(),
  dayId: text("day_id").notNull(),
  slotKey: text("slot_key").notNull(),
  available: boolean("available").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
}, (table) => [primaryKey({ columns: [table.eventId, table.personId, table.dayId, table.slotKey] })]);
