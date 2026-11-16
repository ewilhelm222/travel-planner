// Participant IDs refer to either a family/group or a person. No account access is inferred.
export const isWholeTripGroup = group => group?.allTravelers === true || group?.id === 'everyone';
export const peopleOf = trip => trip.people || [];
export function includesPerson(ids, person, trip) {
    return ids.includes(person.id) || trip.families.some(g => ids.includes(g.id) && (isWholeTripGroup(g) || g.id === person.familyId));
}
export function matchesSelection(record, selection, trip) {
    if (selection === 'all')
        return true;
    const person = peopleOf(trip).find(p => p.id === selection);
    if (person)
        return includesPerson(record.participants || [], person, trip);
    const group = trip.families.find(g => g.id === selection);
    if (!group)
        return false;
    if (isWholeTripGroup(group))
        return true;
    return record.participants.includes(selection) || trip.families.some(g => isWholeTripGroup(g) && record.participants.includes(g.id)) || peopleOf(trip).some(p => p.familyId === selection && record.participants.includes(p.id));
}
export function defaultParticipants(trip) {
    const all = trip.families.find(isWholeTripGroup);
    return all ? [all.id] : [...trip.families.map(g => g.id), ...peopleOf(trip).filter(p => !p.familyId).map(p => p.id)];
}
export function participantRecord(trip, id) {
    const group = trip.families.find(g => g.id === id);
    if (group)
        return group;
    const person = peopleOf(trip).find(p => p.id === id);
    return person ? { ...person, color: trip.families.find(g => g.id === person.familyId)?.color || 'blue' } : null;
}
export function filterChoices(trip) {
    return [...trip.families.filter(g => !isWholeTripGroup(g)).map(g => ({ id: g.id, name: g.name })), ...peopleOf(trip).filter(p => !p.hidden).map(p => ({ id: p.id, name: p.name }))];
}
/**
 * Everything that would be affected by removing a traveler or group: the plans,
 * stays and journeys that list them, and (for a group) its member travelers.
 */
export function participantReferences(trip, id) {
    const uses = rows => (rows || []).filter(r => (r.participants || []).includes(id)).map(r => ({ id: r.id, title: r.title || r.name || r.lodging || r.id }));
    const refs = { activities: uses(trip.activities), stays: uses(trip.stays), legs: uses(trip.legs), members: peopleOf(trip).filter(p => p.familyId === id).map(p => ({ id: p.id, title: p.name })) };
    return { ...refs, total: refs.activities.length + refs.stays.length + refs.legs.length + refs.members.length };
}
export function referenceSummary(refs) {
    const part = (rows, one, many) => rows.length ? `${rows.length} ${rows.length === 1 ? one : many}` : '';
    return [part(refs.activities, 'activity', 'activities'), part(refs.stays, 'stay', 'stays'), part(refs.legs, 'journey', 'journeys'), part(refs.members, 'traveler in this group', 'travelers in this group')].filter(Boolean).join(', ');
}
