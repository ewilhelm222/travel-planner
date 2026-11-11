// Design fixture only. Activities intentionally have no stayId.
export function sampleParallelTrip() {
  return {
    families: [{ id: "cedar", name: "Cedar" }, { id: "maple", name: "Maple" }, { id: "birch", name: "Birch" }],
    cities: [{ id: "kyoto", name: "Kyoto" }, { id: "osaka", name: "Osaka" }],
    stays: [
      { id: "cedar-kyoto", cityId: "kyoto", start: "2027-04-12", end: "2027-04-14", participants: ["cedar"] },
      { id: "maple-osaka", cityId: "osaka", start: "2027-04-12", end: "2027-04-13", participants: ["maple"] },
      { id: "maple-kyoto", cityId: "kyoto", start: "2027-04-13", end: "2027-04-15", participants: ["maple"] },
      { id: "birch-osaka", cityId: "osaka", start: "2027-04-13", end: "2027-04-15", participants: ["birch"] },
      { id: "cedar-osaka", cityId: "osaka", start: "2027-04-14", end: "2027-04-15", participants: ["cedar"] },
    ],
    places: [{ id: "garden", cityId: "kyoto", name: "Sample garden" }, { id: "museum", cityId: "kyoto", name: "Sample museum" }, { id: "dinner", cityId: "kyoto", name: "Fictional shared restaurant" }, { id: "market", cityId: "osaka", name: "Sample market" }],
    activities: [
      { id: "cedar-arrival", date: "2027-04-12", placeId: "garden", title: "Cedar arrives early", time: "Afternoon", order: 0, participants: ["cedar"], fixed: false },
      { id: "maple-before", date: "2027-04-12", placeId: "market", title: "Maple's own Osaka day", time: "Afternoon", order: 1, participants: ["maple"], fixed: false },
      { id: "solo-garden", date: "2027-04-13", placeId: "garden", title: "Cedar: a garden morning", time: "Morning", order: 0, participants: ["cedar"], fixed: false },
      { id: "museum", date: "2027-04-13", placeId: "museum", title: "Maple: a museum afternoon", time: "Afternoon", order: 1, participants: ["maple"], fixed: false },
      { id: "birch-arrival", date: "2027-04-13", placeId: "market", title: "Birch joins, staying in Osaka", time: "Afternoon", order: 2, participants: ["birch"], fixed: false },
      { id: "shared-dinner", date: "2027-04-13", placeId: "dinner", title: "Everyone meets for dinner", time: "18:30", order: 3, participants: ["cedar", "maple", "birch"], fixed: true },
      { id: "shared-walk", date: "2027-04-13", placeId: "garden", title: "Cedar + Maple: optional evening walk", time: "After dinner", order: 4, participants: ["cedar", "maple"], fixed: false },
      { id: "cedar-next", date: "2027-04-14", placeId: "market", title: "Cedar + Birch explore Osaka", time: "Afternoon", order: 0, participants: ["cedar", "birch"], fixed: false },
      { id: "maple-stays", date: "2027-04-14", placeId: "museum", title: "Maple stays another day in Kyoto", time: "Afternoon", order: 1, participants: ["maple"], fixed: false },
    ],
    journeys: [
      { date: "2027-04-13", title: "Maple · Osaka → Kyoto", participants: ["maple"] },
      { date: "2027-04-13", title: "Birch · Osaka ⇄ Kyoto for dinner", participants: ["birch"] },
      { date: "2027-04-14", title: "Cedar · Kyoto → Osaka", participants: ["cedar"] },
    ],
  };
}

export function deriveBoard(trip, family = "all") {
  const places = new Map(trip.places.map(place => [place.id, place]));
  const visible = activity => family === "all" || activity.participants.includes(family);
  return [...new Set(trip.activities.map(a => a.date))].sort().map(date => ({
    date,
    journeys: trip.journeys.filter(j => j.date === date && visible(j)),
    cities: trip.cities.map(city => ({
      ...city,
      staying: [...new Set(trip.stays.filter(stay => stay.cityId === city.id && stay.start <= date && stay.end > date).flatMap(stay => stay.participants))].filter(id => family === "all" || id === family),
      activities: trip.activities.filter(a => a.date === date && places.get(a.placeId)?.cityId === city.id && visible(a)).sort((a,b) => a.order - b.order),
    })).filter(city => city.staying.length || city.activities.length),
  }));
}

export function previewStayShift(trip, stayId, days) {
  const stay = trip.stays.find(s => s.id === stayId);
  if (!stay) throw new Error("Stay not found");
  const places = new Map(trip.places.map(place => [place.id, place]));
  const result = { shift: [], fixed: [], mixed: [], journeys: [] };
  for (const activity of trip.activities) {
    if (activity.date < stay.start || activity.date >= stay.end || places.get(activity.placeId)?.cityId !== stay.cityId || !activity.participants.some(id => stay.participants.includes(id))) continue;
    if (activity.fixed) result.fixed.push(activity.id);
    else if (!activity.participants.every(id => stay.participants.includes(id))) result.mixed.push(activity.id);
    else {
      const date = new Date(`${activity.date}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days);
      result.shift.push({ id: activity.id, date: date.toISOString().slice(0,10) });
    }
  }
  result.journeys = trip.journeys.filter(j => j.date >= stay.start && j.date <= stay.end && j.participants.some(id => stay.participants.includes(id))).map(j => j.title);
  return result;
}
