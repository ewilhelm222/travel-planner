import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
// One versioned document keeps this feasibility proof small.
export const prototypeTrips = sqliteTable("prototype_trips", {
  id: text("id").primaryKey(),
  document: text("document").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const plannerTrips = sqliteTable("planner_trips", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  editorEmails: text("editor_emails").notNull().default("[]"),
  document: text("document").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  shareTokenHash: text("share_token_hash").unique(),
  sharedAt: text("shared_at"),
  // Soft delete: an archived trip keeps its document and history and can be restored by its organizer.
  archivedAt: text("archived_at"),
  archivedBy: text("archived_by"),
});

// Append-only change log. A row is inserted in the same batch as the trip update it
// describes and is never updated or deleted; undo appends a new row instead.
export const plannerChanges = sqliteTable("planner_changes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: text("trip_id").notNull(),
  // The trip revision this change produced.
  revision: integer("revision").notNull(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  at: text("at").notNull(),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  // JSON array of { kind, id, before, after } for every record the change touched.
  records: text("records").notNull().default("[]"),
  // For action "undo": the id of the change that was undone.
  undoes: integer("undoes"),
}, table => [
  uniqueIndex("planner_changes_trip_revision_unique").on(table.tripId, table.revision),
  index("planner_changes_trip_id_idx").on(table.tripId, table.id),
]);
