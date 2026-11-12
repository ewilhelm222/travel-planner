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
