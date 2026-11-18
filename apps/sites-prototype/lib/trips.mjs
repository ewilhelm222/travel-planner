import { isWholeTripGroup, participantReferences, referenceSummary } from "../public/participants.mjs";
import { moveActivity, FIXED_MOVE_ERROR } from "../public/move.mjs";
import { timingOf, TIMINGS } from "../public/board.mjs";
import { normalizeLinks, placeReferences, placeReferenceSummary } from "../public/structure.mjs";
import { applyStayMove } from "../public/stay-move.mjs";
import { normalizePlaceGeo, embedLocation } from "../public/maps.mjs";
const text = (v, max = 4000) => typeof v === "string" ? v.trim().slice(0, max) : "";
export const validDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const id = v => typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
const list = (v, max) => {
    if (!Array.isArray(v) || v.length > max)
        throw new Error("Invalid or oversized collection.");
    return v;
};
export function normalizeTrip(input, tripId) {
    if (!input || !text(input.title, 160))
        throw new Error("Give the trip or event a name.");
    if (!validDate(input.start) || !validDate(input.end) || input.end < input.start || (Date.parse(input.end) - Date.parse(input.start)) / 86400000 > 120)
        throw new Error("Choose a date range of up to 121 days.");
    if (typeof input.timezone !== "string" || !input.timezone)
        throw new Error("Choose a valid time zone.");
    try {
        new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format();
    }
    catch {
        throw new Error("Choose a valid time zone.");
    }
    const unique = rows => {
        const ids = rows.map(r => r.id);
        if (new Set(ids).size !== ids.length || !ids.every(v => id(v) && v !== "all"))
            throw new Error("Records need unique, stable identifiers.");
        return rows;
    };
    const families = unique(list(input.families || [], 20).map(f => ({ id: f.id, name: text(f.name, 80), color: ["green", "orange", "blue"].includes(f.color) ? f.color : "green", allTravelers: isWholeTripGroup(f) })));
    if (families.some(f => !f.name))
        throw new Error("Give each family/group a display name.");
    if (families.filter(isWholeTripGroup).length > 1)
        throw new Error("Only one whole-trip group is allowed.");
    const roster = unique(list(input.people || [], 200).map(p => {
        if (!text(p.name, 80))
            throw new Error("Give each traveler a display name.");
        if (p.familyId && !families.some(g => g.id === p.familyId))
            throw new Error("Choose a family/group from this trip.");
        return { id: p.id, name: text(p.name, 80), familyId: families.find(g => g.id === p.familyId && !isWholeTripGroup(g))?.id || null, showOnGuest: p.showOnGuest === true };
    }));
    if (roster.some(p => families.some(g => g.id === p.id)))
        throw new Error("People and groups need different identifiers.");
    const people = new Set([...families, ...roster].map(f => f.id));
    const participants = value => {
        const p = [...new Set(list(value || [], 220))];
        if (p.some(x => !people.has(x)))
            throw new Error("Choose participants from this trip.");
        return p;
    };
    const places = unique(list(input.places || [], 100).map(p => ({ id: p.id, name: text(p.name, 160), localName: text(p.localName, 160), address: text(p.address, 500), localAddress: text(p.localAddress, 500), parentId: typeof p.parentId === "string" && p.parentId ? p.parentId : null, ...normalizePlaceGeo(p) })));
    // Two levels at most: an area (a city, a camp) and venues inside it.
    for (const p of places) {
        if (!p.parentId)
            continue;
        const parent = places.find(x => x.id === p.parentId);
        if (!parent || parent.id === p.id)
            throw new Error("Choose an area from this trip for this place to sit inside.");
        if (parent.parentId)
            throw new Error("A place can sit inside an area, but areas cannot be nested further. Move its venues out first.");
    }
    const placeIds = new Set(places.map(p => p.id));
    const place = value => {
        if (value && !placeIds.has(value))
            throw new Error("Choose a place from this trip.");
        return value || null;
    };
    const stays = unique(list(input.stays || [], 100).map(s => {
        if (!validDate(s.start) || !validDate(s.end) || s.end <= s.start)
            throw new Error("A stay needs valid check-in and check-out dates.");
        return { id: s.id, name: text(s.name, 160), placeId: place(s.placeId), start: s.start, end: s.end, lodging: text(s.lodging, 500), note: text(s.note), groupInfo: text(s.groupInfo), checkOutTime: text(s.checkOutTime, 80), showOnGuest: s.showOnGuest === true, participants: participants(s.participants) };
    }));
    const activities = unique(list(input.activities || [], 500).map(a => {
        if (!text(a.title, 160))
            throw new Error("Every activity needs a title.");
        if (a.date !== null && (!validDate(a.date) || a.date < input.start || a.date > input.end))
            throw new Error("Choose an activity day within this trip, or leave it unscheduled.");
        return { id: a.id, title: text(a.title, 160), date: a.date, placeId: place(a.placeId), time: text(a.time, 80), order: Number.isSafeInteger(a.order) ? Math.max(0, Math.min(1000, a.order)) : 0, fixed: timingOf(a) === "set", timing: timingOf(a), optional: a.optional === true, highlight: a.highlight === true, participants: participants(a.participants), notes: text(a.notes), address: text(a.address, 500), guestNotes: text(a.guestNotes), guestLocation: text(a.guestLocation, 500), links: normalizeLinks(a.links), imageId: id(a.imageId) ? a.imageId : "", sourceKind: ["tentative", "synthetic", "entered"].includes(a.sourceKind) ? a.sourceKind : "entered" };
    }));
    const legs = unique(list(input.legs || [], 200).map(l => {
        if (!validDate(l.date) || l.date < input.start || l.date > input.end)
            throw new Error("A journey needs a day within this trip.");
        return { id: l.id, title: text(l.title, 160), date: l.date, arrivalDate: validDate(l.arrivalDate) ? l.arrivalDate : l.date, time: text(l.time, 80), arrivalTime: text(l.arrivalTime, 80), mode: text(l.mode, 40), participants: participants(l.participants), notes: text(l.notes), from: place(l.from), to: place(l.to) };
    }));
    return { schemaVersion: 2, id: tripId, title: text(input.title, 160), subtitle: text(input.subtitle, 500), kind: input.kind === "event" ? "event" : "trip", start: input.start, end: input.end, timezone: input.timezone, guestMap: input.guestMap === true, families, people: roster, places, stays, legs, activities };
}
export function applyTripChange(trip, change) {
    const next = structuredClone(trip);
    if (change.action === "traveler") {
        const person = change.person;
        if (!person || !id(person.id))
            throw new Error("Choose a traveler identifier.");
        next.people ||= [];
        const index = next.people.findIndex(p => p.id === person.id);
        if (index < 0)
            next.people.push(person);
        else
            next.people[index] = person;
    }
    else if (change.action === "family") {
        const family = change.family;
        if (!family || !id(family.id))
            throw new Error("Choose a group identifier.");
        const index = next.families.findIndex(g => g.id === family.id);
        if (index < 0)
            next.families.push({ ...family, allTravelers: false });
        else
            next.families[index] = { ...family, allTravelers: isWholeTripGroup(next.families[index]) };
    }
    else if (change.action === "traveler-remove" || change.action === "family-remove") {
        // Removing someone never silently rewrites plans: the caller must see what refers
        // to them and then repeat the request with `unassign: true`.
        const group = change.action === "family-remove", target = group ? change.familyId : change.personId;
        const record = (group ? next.families : next.people || []).find(r => r.id === target);
        if (!record)
            throw new Error(group ? "Group not found. It may already have been removed." : "Traveler not found. They may already have been removed.");
        if (group && isWholeTripGroup(record))
            throw new Error("The whole-trip group always includes everyone and cannot be removed.");
        const references = participantReferences(next, target);
        if (references.total && change.unassign !== true)
            throw Object.assign(new Error(`“${record.name}” is still used by ${referenceSummary(references)}. Confirm removing them from those plans, or reassign the plans first.`), { references });
        for (const key of ["activities", "stays", "legs"])
            for (const row of next[key])
                row.participants = row.participants.filter(x => x !== target);
        if (group) {
            next.families = next.families.filter(g => g.id !== target);
            for (const person of next.people || [])
                if (person.familyId === target)
                    person.familyId = null;
        }
        else
            next.people = next.people.filter(p => p.id !== target);
    }
    else if (STRUCTURE[change.action]) {
        // Places, stays and journeys: add, edit or delete one record. The whole trip is
        // re-validated by normalizeTrip below, so references and dates are always checked.
        const { key, noun, idField, fields, op } = STRUCTURE[change.action], rows = next[key];
        if (op === "add") {
            const record = change[noun];
            if (!record || typeof record !== "object" || !id(record.id) || rows.some(r => r.id === record.id))
                throw new Error(`Choose a new ${noun === "leg" ? "journey" : noun} identifier.`);
            if (Object.keys(record).some(k => k !== "id" && !fields.includes(k)))
                throw new Error("Unsupported edit.");
            rows.push(record);
            checkStructure(noun, record);
        }
        else {
            const index = rows.findIndex(r => r.id === change[idField]);
            if (index < 0)
                throw new Error(`${noun === "leg" ? "Journey" : noun === "stay" ? "Stay" : "Place"} not found. It may have been deleted; load the latest plan.`);
            if (op === "edit") {
                const p = change.patch;
                if (!p || typeof p !== "object" || Array.isArray(p) || !Object.keys(p).length || Object.keys(p).some(k => !fields.includes(k)))
                    throw new Error("Unsupported edit.");
                // A map link that changes is unreviewed again unless the same save says it was checked.
                if (noun === "place" && p.navReviewed !== true && ["amapUrl", "appleMapsUrl"].some(k => k in p && (p[k] || "").trim() !== (rows[index][k] || "")))
                    rows[index].navReviewed = false;
                // The typed map location decides the coordinates. A page from before it existed sends
                // latitude and longitude instead, which then replace whatever was typed earlier.
                if (noun === "place" && "locationText" in p)
                    rows[index].lat = rows[index].lng = null;
                else if (noun === "place" && ("lat" in p || "lng" in p))
                    rows[index].locationText = "";
                Object.assign(rows[index], p);
                checkStructure(noun, rows[index]);
            }
            else {
                if (noun === "place") {
                    // A place in use is never dropped silently: refuse, or move its references where the caller says.
                    const target = rows[index].id, references = placeReferences(next, target);
                    if (references.total) {
                        if (!("reassignTo" in change))
                            throw Object.assign(new Error(`“${rows[index].name}” is still used by ${placeReferenceSummary(references)}. Choose where to move them before deleting this place.`), { references });
                        const to = change.reassignTo;
                        if (to !== null && (to === target || !rows.some(r => r.id === to)))
                            throw new Error("Choose a different place from this trip to move them to.");
                        for (const a of next.activities)
                            if (a.placeId === target)
                                a.placeId = to;
                        for (const stay of next.stays)
                            if (stay.placeId === target)
                                stay.placeId = to;
                        for (const leg of next.legs) {
                            if (leg.from === target)
                                leg.from = to;
                            if (leg.to === target)
                                leg.to = to;
                        }
                        // Venues inside a deleted area move into the chosen area, or become areas themselves.
                        const newArea = rows.find(r => r.id === to && !r.parentId);
                        for (const p of rows)
                            if (p.parentId === target)
                                p.parentId = newArea && newArea.id !== p.id ? newArea.id : null;
                    }
                }
                rows.splice(index, 1);
            }
        }
    }
    else if (change.action === "metadata") {
        for (const key of ["title", "subtitle", "start", "end", "timezone", "kind", "guestMap"])
            if (key in (change.patch || {}))
                next[key] = change.patch[key];
    }
    else if (change.action === "stay-move") {
        // A confirmed stay move: shifts only the listed flexible activities, re-checked against the trip as it is now.
        return normalizeTrip(applyStayMove(trip, { stayId: change.stayId, days: change.days, shiftActivityIds: change.shiftActivityIds }), trip.id);
    }
    else if (change.action === "move") {
        // Drag-and-drop: one record changes day/order for every participant.
        return normalizeTrip(moveActivity(trip, { activityId: change.activityId, date: change.date ?? null, beforeId: change.beforeId ?? null }).trip, trip.id);
    }
    else if (change.action === "add") {
        if (!id(change.activity?.id) || next.activities.some(a => a.id === change.activity.id))
            throw new Error("Choose a new activity identifier.");
        next.activities.push(change.activity);
        // "Add here": place the new activity before a named card of the same day; otherwise it goes last.
        if (typeof change.beforeId === "string" && change.activity.date) {
            // Start it at the end of its day, so placing it always renumbers the day and never leaves a tie.
            next.activities.at(-1).order = 1000;
            const added = normalizeTrip(next, trip.id);
            return normalizeTrip(moveActivity(added, { activityId: change.activity.id, date: added.activities.find(a => a.id === change.activity.id).date, beforeId: change.beforeId }).trip, trip.id);
        }
    }
    else {
        const a = next.activities.find(a => a.id === change.activityId);
        if (!a)
            throw new Error("Activity not found.");
        if (change.action === "delete") {
            next.activities = next.activities.filter(x => x.id !== a.id);
        }
        else {
            const p = change.patch && typeof change.patch === "object" && !Array.isArray(change.patch) ? { ...change.patch } : change.patch;
            const allowed = ["title", "notes", "address", "links", "guestNotes", "guestLocation", "time", "date", "order", "placeId", "fixed", "timing", "optional", "highlight", "participants", "imageId"];
            if (!p || typeof p !== "object" || Array.isArray(p) || !Object.keys(p).length || Object.keys(p).some(k => !allowed.includes(k)))
                throw new Error("Unsupported edit.");
            // A timing level, when sent, decides `fixed`. A page from before timing levels sends only `fixed`.
            if ("timing" in p) {
                if (!TIMINGS.includes(p.timing))
                    throw new Error("Choose how firm the timing is.");
                p.fixed = p.timing === "set";
            }
            if (a.fixed && p.fixed !== false && (("date" in p && p.date !== a.date) || ("time" in p && p.time !== a.time)))
                throw new Error(FIXED_MOVE_ERROR);
            Object.assign(a, p);
        }
    }
    return normalizeTrip(next, trip.id);
}
const PLACE_FIELDS = ["name", "localName", "address", "localAddress", "parentId", "locationText", "lat", "lng", "coordSystem", "coordSource", "amapUrl", "appleMapsUrl", "navReviewed"];
const STAY_FIELDS = ["name", "placeId", "start", "end", "lodging", "note", "groupInfo", "checkOutTime", "showOnGuest", "participants"];
const LEG_FIELDS = ["title", "date", "arrivalDate", "time", "arrivalTime", "mode", "participants", "notes", "from", "to"];
const structure = (key, noun, fields) => Object.fromEntries(["add", "edit", "delete"].map(op => [`${noun}-${op}`, { key, noun, idField: `${noun}Id`, fields, op }]));
const STRUCTURE = { ...structure("places", "place", PLACE_FIELDS), ...structure("stays", "stay", STAY_FIELDS), ...structure("legs", "leg", LEG_FIELDS) };
// Rules for the one record being added or edited that normalizeTrip does not enforce for stored trips.
function checkStructure(noun, record) {
    if (noun === "place" && !text(record.name, 160))
        throw new Error("Give the place a name.");
    if (noun === "stay" && !record.placeId)
        throw new Error("Choose the place for this stay, or add a new place first.");
    if (noun === "leg") {
        if (!text(record.title, 160))
            throw new Error("Give the journey a short title.");
        if (record.arrivalDate && (!validDate(record.arrivalDate) || record.arrivalDate < record.date))
            throw new Error("A journey cannot arrive before it leaves.");
    }
}
// Trip membership. The organizer is the account that created the trip; editors are
// listed by sign-in email. Everyone else, signed in or not, has no access.
export const MAX_EDITORS = 20;
export function editorList(row) {
    try {
        const value = JSON.parse(row?.editor_emails || "[]");
        return Array.isArray(value) ? value.filter(e => typeof e === "string").map(e => e.toLowerCase()) : [];
    }
    catch {
        return [];
    }
}
export function tripRole(row, user) {
    if (!row || !user)
        return null;
    if (row.owner_id === user.userId)
        return "organizer";
    return typeof user.email === "string" && editorList(row).includes(user.email.toLowerCase()) ? "editor" : null;
}
export function canEdit(row, user) { return tripRole(row, user) !== null; }
export function editorEmail(value) {
    const email = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@,;"<>]+@[^\s@,;"<>]+\.[^\s@,;"<>]+$/.test(email))
        throw new Error("Enter one complete email address.");
    return email;
}
// Changes an editor may not make through the shared save path. Returns a message, or null when allowed.
export const EDITOR_TRIP_DETAILS = "Only the organizer changes the trip's name, subtitle, dates, time zone or kind.";
export function editorRestriction(trip, change) {
    // Decided November 16, 2026 (docs/editors.md): the trip's own details are the organizer's.
    // Editors may still write an activity's guest description and meeting point.
    if (change?.action === "metadata")
        return EDITOR_TRIP_DETAILS;
    if (change?.action === "traveler") {
        const existing = (trip.people || []).find(p => p.id === change.person?.id);
        if ((change.person?.showOnGuest === true) !== (existing?.showOnGuest === true))
            return "Only the organizer chooses whether a traveler's name shows on the guest link.";
    }
    // A stay reaches the guest link only by the organizer's choice; editors may still write its text.
    if (change?.action === "stay-add" && change.stay?.showOnGuest === true)
        return STAY_GUEST_RULE;
    if (change?.action === "stay-edit" && change.patch && "showOnGuest" in change.patch) {
        const existing = (trip.stays || []).find(s => s.id === change.stayId);
        if ((change.patch.showOnGuest === true) !== (existing?.showOnGuest === true))
            return STAY_GUEST_RULE;
    }
    return null;
}
export const STAY_GUEST_RULE = "Only the organizer chooses whether a stay is shown on the guest link.";
// The same rule for a whole before/after pair, used where there is no single request to inspect (undo).
export function editorDiffRestriction(before, after) {
    const shown = trip => JSON.stringify((trip.people || []).filter(p => p.showOnGuest === true).map(p => p.id).sort());
    const details = trip => JSON.stringify([...["title", "subtitle", "start", "end", "timezone", "kind"].map(k => trip[k] ?? null), trip.guestMap === true]);
    if (details(before) !== details(after))
        return EDITOR_TRIP_DETAILS;
    const stays = trip => JSON.stringify((trip.stays || []).filter(s => s.showOnGuest === true).map(s => s.id).sort());
    if (stays(before) !== stays(after))
        return STAY_GUEST_RULE;
    return shown(before) === shown(after) ? null : "Only the organizer chooses whether a traveler's name shows on the guest link.";
}
export function publicTrip(trip) {
    // Roster display names are opt-in. Private-person references become generic labels,
    // retaining group filtering without revealing their names, IDs, or member counts.
    const families = trip.families.map(f => ({ id: f.id, name: f.name, color: f.color, allTravelers: isWholeTripGroup(f) }));
    const roster = trip.people || [];
    const people = roster.filter(p => p.showOnGuest === true).map(p => ({ id: p.id, name: p.name, familyId: p.familyId, showOnGuest: true }));
    const used = new Set([...families, ...roster].map(p => p.id)), anonymous = new Map();
    function guestId(id) {
        const person = roster.find(p => p.id === id);
        if (!person || person.showOnGuest === true)
            return id;
        const family = families.find(g => g.id === person.familyId && !isWholeTripGroup(g));
        const key = family?.id || '';
        if (!anonymous.has(key)) {
            let safeId = 'guest-unnamed-' + anonymous.size;
            while (used.has(safeId))
                safeId += 'x';
            used.add(safeId);
            anonymous.set(key, safeId);
            people.push({ id: safeId, name: family ? `Some members of ${family.name}` : 'Some travelers', familyId: family?.id || null, hidden: true });
        }
        return anonymous.get(key);
    }
    // Examples (invented items) are never sent to guests: an example must not be read as a plan.
    // Unscheduled ideas are shared too (decided November 16, 2026), with the same limited fields.
    const activities = trip.activities.filter(a => a.sourceKind !== "synthetic").map(a => ({ id: a.id, title: a.title, date: a.date, placeId: a.placeId, time: a.time, order: a.order, fixed: timingOf(a) === "set", timing: timingOf(a), optional: a.optional, highlight: a.highlight, participants: [...new Set(a.participants.map(guestId))], notes: a.guestNotes, address: a.guestLocation, imageId: a.imageId || "", sourceKind: a.sourceKind }));
    return { schemaVersion: 2, id: 'guest-view', title: trip.title, subtitle: trip.subtitle, kind: trip.kind, start: trip.start, end: trip.end, timezone: trip.timezone,
        families, people, guestMap: trip.guestMap === true,
        // A place's map location reaches guests only when the organizer switched the Google day map on for the
        // guest link, only for places a shared, dated activity happens at, and only as the one line of text
        // Google is given (docs/google-maps-embed.md). Its address, coordinates' system and links stay private.
        places: trip.places.map(p => ({ id: p.id, name: p.name, localName: p.localName, parentId: p.parentId || null, ...(trip.guestMap === true && activities.some(a => a.date && a.placeId === p.id) && embedLocation(p) ? { mapQuery: embedLocation(p) } : {}) })),
        // A stay is shared only when the organizer ticked it, and then without its private note.
        stays: (trip.stays || []).filter(s => s.showOnGuest === true).map(s => ({ id: s.id, name: s.name, placeId: s.placeId, start: s.start, end: s.end, lodging: s.lodging, groupInfo: s.groupInfo, checkOutTime: s.checkOutTime, showOnGuest: true, participants: [...new Set((s.participants || []).map(guestId))] })),
        legs: [], activities };
}
export async function tokenHash(token) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))].map(b => b.toString(16).padStart(2, "0")).join(""); }
export function newShareToken() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
export function upgradeLegacy(trip) {
    const stays = trip.stays.map(s => ({ ...s, placeId: s.id, participants: trip.families.map(f => f.id) }));
    return normalizeTrip({ ...trip, start: stays[0].start, end: stays.at(-1).end, places: stays.map(s => ({ id: s.id, name: s.name })), stays, activities: trip.activities.map(a => ({ ...a, placeId: a.stayId, guestNotes: "", guestLocation: "", sourceKind: "synthetic" })) }, trip.id);
}
export function thanksgivingExample() {
    const participants = ["cedar", "maple", "birch"];
    const rows = [
        ["2026-11-25", "Evening", "Arrive, settle in, and soup", "An easy welcome supper. Drop in as you arrive.", false],
        ["2026-11-26", "Morning", "Neighborhood walk", "A relaxed loop before the kitchen gets busy. Route and weather to confirm.", true],
        ["2026-11-26", "Morning", "Cook together", "Help with prep, set the table, or bring a favorite recipe.", true],
        ["2026-11-26", "Afternoon", "Board games & quiet time", "An indoor alternative to the walk. Come and go.", true],
        ["2026-11-26", "17:00", "Thanksgiving dinner", "Sample gathering time, not a reservation. We will confirm the real plan together.", false],
        ["2026-11-27", "Morning", "A longer hike", "Optional outing; trail, weather, and meeting point to confirm.", true],
        ["2026-11-27", "Morning", "Coffee, books, and staying in", "A slower alternative for anyone who wants a quiet morning.", true],
        ["2026-11-27", "Afternoon", "Make something together", "A low-key craft or cooking project; materials to be chosen.", true],
        ["2026-11-27", "Evening", "Leftovers & a movie", "Choose a film together after dinner.", true],
        ["2026-11-28", "Morning", "Explore a local market", "Optional outing. The actual market and transport still need choosing.", true],
        ["2026-11-28", "Afternoon", "Open afternoon", "Games, a walk, or a nap. No commitment required.", true],
        ["2026-11-29", "Morning", "Breakfast & goodbyes", "Flexible departures after breakfast.", false]
    ];
    return normalizeTrip({ title: "Thanksgiving, together", subtitle: "Synthetic planning example · choose what sounds good each day", kind: "event", start: "2026-11-25", end: "2026-11-29", timezone: "America/Los_Angeles", families: participants.map((id, i) => ({ id, name: ["Cedar family", "Maple family", "Birch family"][i], color: ["green", "orange", "blue"][i] })), places: [{ id: "home", name: "Our shared base · location to confirm" }], stays: [{ id: "shared-base", name: "Everyone under one roof", placeId: "home", start: "2026-11-25", end: "2026-11-30", lodging: "Synthetic shared house · actual location to confirm", note: "All families stay together. Activities are choices, not attendance commitments.", participants }], legs: [], activities: rows.map(([date, time, title, description, optional], i) => ({ id: `option-${i + 1}`, date, time, title, placeId: "home", order: i, participants, fixed: false, optional, highlight: title === "Thanksgiving dinner", notes: "Synthetic example. Replace before the real gathering.", guestNotes: description, guestLocation: "Meeting point to confirm", sourceKind: "synthetic" })) }, "thanksgiving-example");
}
// A trip as stored before timing levels existed reads with each activity's level filled in, so the first
// save after the upgrade logs only the record that was really changed.
export function withTiming(trip) {
    if (!Array.isArray(trip?.activities) || trip.activities.every(a => a.timing))
        return trip;
    return { ...trip, activities: trip.activities.map(a => a.timing ? a : { ...a, timing: timingOf(a) }) };
}
