import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
  description: text("description").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by"),
});
