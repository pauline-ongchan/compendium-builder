import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const eventStates = pgTable("event_states", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by"),
});
