// Full-trip snapshot format shared by the organizer's manual "Full backup" download,
// the import/restore path, and the proposed (not enabled) daily snapshot job.
// Pure functions: building, verifying and restoring are tested without a database.
export const SNAPSHOT_FORMAT = "waypoint-full-trip-snapshot";
export const SNAPSHOT_VERSION = 1;

const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
const digest = async value => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))));
const payload = s => ({ tripId: s.tripId, revision: s.revision, updatedAt: s.updatedAt, updatedBy: s.updatedBy, trip: s.trip, changes: s.changes });

/**
 * One self-describing file holding the whole trip document, its revision and its change log.
 * It deliberately leaves out editor emails, owner identity and guest-link token hashes.
 * @param {{ trip: any, revision: number, updatedAt: string, updatedBy: string, changes?: any[] }} source
 * @param {string} [takenAt]
 */
export async function buildSnapshot({ trip, revision, updatedAt, updatedBy, changes = [] }, takenAt = new Date().toISOString()) {
  if (!trip?.id || !Array.isArray(trip.activities)) throw new Error("There is no trip to back up.");
  const snapshot = { format: SNAPSHOT_FORMAT, version: SNAPSHOT_VERSION, takenAt, tripId: trip.id, revision, updatedAt, updatedBy, trip, changes };
  return { ...snapshot, sha256: await digest(payload(snapshot)) };
}

export const isSnapshot = value => value?.format === SNAPSHOT_FORMAT;

/** Throws unless the file is a complete, unmodified snapshot this version understands. */
export async function verifySnapshot(snapshot) {
  if (!isSnapshot(snapshot)) throw new Error("This is not a Waypoint full-trip backup.");
  if (snapshot.version !== SNAPSHOT_VERSION) throw new Error(`This backup uses format version ${snapshot.version}; this planner reads version ${SNAPSHOT_VERSION}.`);
  if (!snapshot.trip || !Array.isArray(snapshot.trip.activities) || !Array.isArray(snapshot.changes)) throw new Error("This backup is incomplete.");
  if (snapshot.sha256 !== await digest(payload(snapshot))) throw new Error("This backup is damaged or was edited: its checksum does not match. Nothing was restored.");
  return snapshot;
}

/**
 * The trip document to hand to the normal import path. A restore always creates a
 * separate new trip; it never overwrites the live one, so a bad backup cannot make things worse.
 */
export async function restoreFromSnapshot(snapshot) {
  return structuredClone((await verifySnapshot(snapshot)).trip);
}

/** Which daily snapshots a retention sweep would delete, keeping `days` days. Names are `<tripId>/<YYYY-MM-DD>.json`. */
export function expiredSnapshots(names, today, days = 30) {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const limit = cutoff.toISOString().slice(0, 10);
  return names.filter(name => { const date = name.match(/\/(\d{4}-\d{2}-\d{2})\.json$/)?.[1]; return !!date && date < limit; });
}
