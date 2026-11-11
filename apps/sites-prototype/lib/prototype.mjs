export const TRIP_ID = "synthetic-trip";
export const SCHEMA_VERSION = 1;

export function createSampleTrip() {
  return {
    schemaVersion: SCHEMA_VERSION, id: TRIP_ID,
    title: "A little further east", subtitle: "A sample journey through Japan", timezone: "Asia/Tokyo",
    families: [{ id: "cedar", name: "Cedar family", color: "green" }, { id: "maple", name: "Maple family", color: "orange" }],
    stays: [
      { id: "kyoto", name: "Kyoto", start: "2027-04-12", end: "2027-04-14", note: "Quiet lanes, good food, and room to wander.", lodging: "Sample guesthouse · Higashiyama" },
      { id: "osaka", name: "Osaka", start: "2027-04-14", end: "2027-04-15", note: "A change of scene, one easy train ride away.", lodging: "Sample hotel · Namba" },
    ],
    legs: [{ id: "train", from: "kyoto", to: "osaka", date: "2027-04-14", mode: "Train", title: "Kyoto → Osaka", notes: "Sample journey · train and departure time to be chosen", participants: ["cedar", "maple"] }],
    activities: [
      { id: "a1", stayId: "kyoto", date: "2027-04-12", order: 0, title: "Arrive & settle in", time: "Afternoon", type: "arrival", fixed: false, participants: ["cedar", "maple"], notes: "Leave the first afternoon open. Drop bags, find lunch, and get a feel for the neighborhood.", address: "Higashiyama, Kyoto" },
      { id: "a2", stayId: "kyoto", date: "2027-04-12", order: 1, title: "An evening along the river", time: "Evening", type: "walk", fixed: false, participants: ["cedar", "maple"], notes: "A relaxed walk together. If it rains, choose a covered market instead.", address: "Kamo River, Kyoto" },
      { id: "a3", stayId: "kyoto", date: "2027-04-13", order: 0, title: "Early morning in the gardens", time: "Morning", type: "outdoors", fixed: false, participants: ["cedar"], notes: "Start early, and keep the afternoon flexible.", address: "Kyoto Botanical Gardens" },
      { id: "a4", stayId: "kyoto", date: "2027-04-13", order: 1, title: "Browse the museum", time: "Morning", type: "culture", fixed: false, participants: ["maple"], notes: "A separate morning for the Maple family. Meet the others for dinner.", address: "Kyoto National Museum" },
      { id: "a5", stayId: "kyoto", date: "2027-04-13", order: 2, title: "Dinner, all together", time: "18:30", type: "food", fixed: true, participants: ["cedar", "maple"], notes: "Fictional fixed booking. One shared record appears in both family views. No actual restaurant is reserved.", address: "Central Kyoto" },
      { id: "a6", stayId: "osaka", date: "2027-04-14", order: 0, title: "Find our Osaka favorites", time: "Afternoon", type: "food", fixed: false, participants: ["cedar", "maple"], notes: "Drop bags, explore the neighborhood, and follow whatever smells good.", address: "Namba, Osaka" },
    ],
  };
}

export function validateChange(value) {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 1) return "A valid saved revision is required.";
  if (typeof value.activityId !== "string" || value.activityId.length > 80) return "Choose an activity.";
  const p = value.patch;
  if (!p || typeof p !== "object" || Array.isArray(p)) return "An edit is required.";
  const allowed = ["title", "notes", "time", "date", "order"];
  if (!Object.keys(p).length || Object.keys(p).some(k => !allowed.includes(k))) return "This edit contains unsupported fields.";
  if ("title" in p && (typeof p.title !== "string" || !p.title.trim() || p.title.length > 160)) return "Use a title of 1–160 characters.";
  if ("notes" in p && (typeof p.notes !== "string" || p.notes.length > 4000)) return "Notes must be at most 4,000 characters.";
  if ("time" in p && (typeof p.time !== "string" || p.time.length > 80)) return "Time must be at most 80 characters.";
  if ("date" in p && (typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(Date.parse(p.date)) || new Date(p.date).toISOString().slice(0,10) !== p.date)) return "Choose a valid date.";
  if ("order" in p && (!Number.isSafeInteger(p.order) || p.order < 0 || p.order > 1000)) return "Invalid activity order.";
  return null;
}

export function applyChange(trip, activityId, patch) {
  const next = structuredClone(trip);
  const activity = next.activities.find(a => a.id === activityId);
  if (!activity) throw new Error("Activity not found.");
  if (activity.fixed && ((patch.date !== undefined && patch.date !== activity.date) || (patch.time !== undefined && patch.time !== activity.time))) throw new Error("This is a fixed booking. Its date and time stay unchanged in this prototype.");
  const stay = next.stays.find(s => s.id === activity.stayId);
  if (patch.date !== undefined && (patch.date < stay.start || patch.date >= stay.end)) throw new Error("Choose a day within this stay. Moving stays will come in the next milestone.");
  Object.assign(activity, patch, { title: (patch.title ?? activity.title).trim() });
  return next;
}
