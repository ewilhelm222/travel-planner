import { normalizeTrip } from '../../lib/trips.mjs';
// Synthetic parallel-stay trip modelled on the read-only study: Cedar and Maple overlap in
// Kyoto, Birch stays in Osaka, one shared fixed dinner, one walk shared by Cedar and Maple.
export function parallelTripInput() {
    const act = (id, date, placeId, title, participants, extra = {}) => ({ id, date, placeId, title, participants, order: 0, ...extra });
    return {
        title: 'Synthetic parallel stays', start: '2027-04-10', end: '2027-04-18', timezone: 'Asia/Tokyo', kind: 'trip',
        families: [{ id: 'cedar', name: 'Cedar', color: 'green' }, { id: 'maple', name: 'Maple', color: 'orange' }, { id: 'birch', name: 'Birch', color: 'blue' }],
        people: [{ id: 'cy', name: 'Cy Cedar', familyId: 'cedar' }, { id: 'cora', name: 'Cora Cedar', familyId: 'cedar' }, { id: 'mo', name: 'Mo Maple', familyId: 'maple' }],
        places: [{ id: 'kyoto', name: 'Kyoto' }, { id: 'osaka', name: 'Osaka' }],
        stays: [
            { id: 'cedar-kyoto', placeId: 'kyoto', start: '2027-04-12', end: '2027-04-14', participants: ['cedar'] },
            { id: 'maple-kyoto', placeId: 'kyoto', start: '2027-04-13', end: '2027-04-15', participants: ['maple'] },
            { id: 'birch-osaka', placeId: 'osaka', start: '2027-04-13', end: '2027-04-15', participants: ['birch'] },
            { id: 'cedar-osaka', placeId: 'osaka', start: '2027-04-14', end: '2027-04-16', participants: ['cedar'] },
        ],
        legs: [
            { id: 'cedar-train', title: 'Cedar · Kyoto → Osaka', date: '2027-04-14', mode: 'Train', from: 'kyoto', to: 'osaka', participants: ['cedar'] },
            { id: 'maple-train', title: 'Maple · Osaka → Kyoto', date: '2027-04-13', mode: 'Train', from: 'osaka', to: 'kyoto', participants: ['maple'] },
        ],
        activities: [
            act('cedar-arrival', '2027-04-12', 'kyoto', 'Cedar arrives early', ['cedar']),
            act('solo-garden', '2027-04-13', 'kyoto', 'Cedar: a garden morning', ['cedar']),
            act('cy-only', '2027-04-13', 'kyoto', 'Cy: bike ride', ['cy']),
            act('checkout-coffee', '2027-04-14', 'kyoto', 'Cedar: last coffee before the train', ['cedar']),
            act('museum', '2027-04-13', 'kyoto', 'Maple: a museum afternoon', ['maple']),
            act('shared-dinner', '2027-04-13', 'kyoto', 'Everyone meets for dinner', ['cedar', 'maple', 'birch'], { fixed: true, time: '18:30' }),
            act('cedar-tea', '2027-04-12', 'kyoto', 'Cedar: booked tea ceremony', ['cedar'], { fixed: true }),
            act('shared-walk', '2027-04-13', 'kyoto', 'Cedar + Maple: evening walk', ['cedar', 'maple']),
            act('cy-mo', '2027-04-13', 'kyoto', 'Cy and Mo: arcade', ['cy', 'mo']),
            act('cedar-osaka-day', '2027-04-13', 'osaka', 'Cedar: day trip to Osaka', ['cedar']),
            act('birch-market', '2027-04-13', 'osaka', 'Birch: market', ['birch']),
            act('cedar-idea', null, 'kyoto', 'Cedar: maybe a temple', ['cedar']),
            act('cedar-later', '2027-04-16', 'kyoto', 'Cedar: back in Kyoto later', ['cedar']),
        ],
    };
}
export const parallelTrip = () => normalizeTrip(parallelTripInput(), 'parallel');
