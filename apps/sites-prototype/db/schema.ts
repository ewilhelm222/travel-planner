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
  // Trip-wide version counter: guards each atomic write. Conflicts are decided per record below.
  revision: integer("revision").notNull().default(1),
  // JSON map of record key ("activity:<id>", "trip", "share", ...) to that record's revision.
  // A missing key means revision 1, so trips saved before this column existed need no rewrite.
  recordRevisions: text("record_revisions").notNull().default("{}"),
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

// Small pictures for activity cards, downscaled in the browser before upload. A row is written once and
// never changed; an activity points at it by id, and that pointer is saved and logged like any other field.
export const plannerImages = sqliteTable("planner_images", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull(),
  mime: text("mime").notNull(),
  // Base64 of the image bytes.
  data: text("data").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
}, table => [
  index("planner_images_trip_id_idx").on(table.tripId),
]);
