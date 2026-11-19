import { normalizeTrip } from '../../lib/trips.mjs';
// A made-up multi-city trip for the travel bridge: Tokyo → Kyoto → Osaka, 3–8 May. Every name, train, time and
// lodging is invented. It carries one of each case the board has to tell apart:
//  - a change of area with transport entered (Tokyo → Kyoto, mid-day, 5 May),
//  - a change of lodging inside one area (two Kyoto stays, 6 May),
//  - a day trip that returns to the same stay (Kyoto → Nara → Kyoto, 6 May),
//  - a second change of area (Kyoto → Osaka, 7 May),
//  - travel on the first and last day that is not a change of stay (flights in and out).
// The travel day's cards are deliberately stored arrival-first, the way the old board read.
export function japanTripInput() {
    const all = ['everyone'];
    const act = (id, date, order, placeId, title, time, extra = {}) => ({ id, date, order, placeId, title, time, participants: all, notes: 'Made-up plan for the demo trip.', ...extra });
    return {
        title: 'Spring in Japan (made-up demo)', subtitle: 'Fictional trip · Tokyo, Kyoto, Osaka', kind: 'trip', start: '2027-05-03', end: '2027-05-08', timezone: 'Asia/Tokyo',
        families: [{ id: 'everyone', name: 'Everyone', color: 'green' }, { id: 'cedar', name: 'Cedar family', color: 'green' }, { id: 'maple', name: 'Maple family', color: 'orange' }],
        people: [],
        places: [
            { id: 'tokyo', name: 'Tokyo' }, { id: 'kyoto', name: 'Kyoto' }, { id: 'osaka', name: 'Osaka' }, { id: 'nara', name: 'Nara' },
            { id: 'tokyo-station', name: 'Tokyo Station', parentId: 'tokyo' }, { id: 'kyoto-station', name: 'Kyoto Station', parentId: 'kyoto' },
            { id: 'fushimi', name: 'Fushimi gates', parentId: 'kyoto' }, { id: 'dotonbori', name: 'Dotonbori', parentId: 'osaka' },
        ],
        stays: [
            { id: 'stay-tokyo', placeId: 'tokyo', start: '2027-05-03', end: '2027-05-05', lodging: 'Bureau of Ginkgo Lanterns (made up)', checkOutTime: 'by 10:00', participants: all },
            { id: 'stay-kyoto-machiya', placeId: 'kyoto', start: '2027-05-05', end: '2027-05-06', lodging: 'Paper Crane Machiya (made up)', participants: all },
            { id: 'stay-kyoto-ryokan', placeId: 'kyoto', start: '2027-05-06', end: '2027-05-07', lodging: 'Mossy Lantern Ryokan (made up)', participants: all },
            { id: 'stay-osaka', placeId: 'osaka', start: '2027-05-07', end: '2027-05-08', lodging: 'Hotel Neon Octopus (made up)', participants: all },
        ],
        legs: [
            { id: 'flight-in', title: 'Flight WP 101 (made up)', mode: 'Flight', date: '2027-05-03', time: '', arrivalTime: '15:40', from: null, to: 'tokyo', participants: all, notes: 'Invented flight. Meet at arrivals.' },
            { id: 'tokyo-kyoto', title: 'Hikari Sample 505', mode: 'Train', date: '2027-05-05', time: '10:12', arrivalTime: '12:27', from: 'tokyo-station', to: 'kyoto-station', participants: all, notes: 'Invented train. Car 7, seats 3A to 3D. Big bags are sent ahead the night before; carry day bags only.' },
            { id: 'nara-out', title: 'Local train to Nara', mode: 'Train', date: '2027-05-06', time: '09:05', arrivalTime: '09:50', from: 'kyoto-station', to: 'nara', participants: all, notes: '' },
            { id: 'nara-back', title: 'Local train back to Kyoto', mode: 'Train', date: '2027-05-06', time: '17:10', arrivalTime: '17:55', from: 'nara', to: 'kyoto-station', participants: all, notes: '' },
            { id: 'kyoto-osaka', title: 'Rapid Sample 12', mode: 'Train', date: '2027-05-07', time: '15:02', arrivalTime: '15:31', from: 'kyoto-station', to: 'osaka', participants: all, notes: 'Invented train. No reserved seats.' },
            { id: 'flight-out', title: 'Flight WP 102 (made up)', mode: 'Flight', date: '2027-05-08', time: '17:20', arrivalTime: '', from: 'osaka', to: null, participants: all, notes: '' },
        ],
        activities: [
            act('tokyo-arrive', '2027-05-03', 0, 'tokyo', 'Drop bags and stretch legs', 'Afternoon'),
            act('tokyo-ramen', '2027-05-03', 1, 'tokyo', 'Ramen alley supper', 'Evening'),
            act('tokyo-market', '2027-05-04', 0, 'tokyo', 'Market breakfast', 'Morning'),
            act('tokyo-lights', '2027-05-04', 1, 'tokyo', 'Light-room museum', '14:00', { fixed: true }),
            act('kyoto-arrive', '2027-05-05', 0, 'kyoto-station', 'Arrive, bags into lockers', '12:30'),
            act('travel-breakfast', '2027-05-05', 1, null, 'Breakfast on the way', '08:00'),
            act('tokyo-board', '2027-05-05', 2, 'tokyo-station', 'Check out and board the train', '09:30'),
            act('kyoto-gion', '2027-05-05', 3, 'kyoto', 'Evening walk through the lanes', 'Evening'),
            act('nara-park', '2027-05-06', 0, 'nara', 'Deer park and the great hall', 'Morning'),
            act('kyoto-dinner', '2027-05-06', 1, 'kyoto', 'Dinner back in Kyoto', '19:00'),
            act('kyoto-gates', '2027-05-07', 0, 'fushimi', 'Gates at dawn', '06:30'),
            act('kyoto-checkout', '2027-05-07', 1, 'kyoto', 'Check out, bags to the station', '11:00'),
            act('osaka-dinner', '2027-05-07', 2, 'dotonbori', 'Canal-side dinner', '18:30', { highlight: true }),
            act('osaka-knives', '2027-05-07', 3, 'osaka', 'Maple: kitchen-knife street', 'Late afternoon', { participants: ['maple'] }),
            act('osaka-castle', '2027-05-08', 0, 'osaka', 'Castle park morning', 'Morning'),
            act('osaka-aquarium', '2027-05-08', 1, 'osaka', 'Cedar: aquarium', 'Morning', { participants: ['cedar'] }),
            act('idea-tea', null, 0, 'kyoto', 'Tea ceremony', ''),
            act('idea-okonomiyaki', null, 1, 'osaka', 'Okonomiyaki lesson', ''),
            act('idea-onsen', null, 2, null, 'A bath-house afternoon', ''),
        ],
    };
}
export const japanTrip = () => normalizeTrip(japanTripInput(), 'japan-demo');
