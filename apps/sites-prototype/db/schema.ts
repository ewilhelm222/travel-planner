import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
// One versioned document keeps this feasibility proof small.
export const prototypeTrips = sqliteTable("prototype_trips", {
  id: text("id").primaryKey(),
  document: text("document").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});
