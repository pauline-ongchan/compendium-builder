import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const eventStates = pgTable("event_states", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by"),
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
