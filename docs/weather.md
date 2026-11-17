# Weather under each date

Status: November 17, 2026. Built and checked locally with a synthetic trip and a
mocked weather service; not deployed. No database migration. **Neither outside
service could be reached from the build environment**, so the live forecast and
the address lookup are unverified (see "Not verified"). It makes no claim about
working in China.

## For planners and guests

Every day header has one more line, directly under the date: the forecast for
where that day's stay is.

- **Precipitation first.** An icon and a few words: `Rain 80%`, `Snow 90% · 4 in`,
  `Rain & snow 70% · 1.2 in snow`, or a quiet `Dry`. The percentage is the chance
  of precipitation. The expected amount is shown for snow, and for rain from
  about 0.4 in (10 mm); from about 1 in (25 mm) it reads `Heavy rain`.
- **Temperature second**, smaller: high/low, e.g. `32°/21°`. In a narrow column
  it is the first thing dropped.
- A wet day is a lit pill (teal outline for rain, solid teal for heavy rain,
  cream for snow and mixed); a dry day is plain quiet text.
- Wet and snowy days also get a small icon on their day chip. Dry days and days
  with no forecast leave the chip as it was.
- A day with no forecast shows a faint dash. That happens when the date is past
  the 16-day forecast range or already over, the stay has no usable location,
  or the lookup failed. Nothing is invented and no averages are shown.
- Under the schedule a note says when the forecast was updated and credits the
  source. The same time is in each line's tooltip, and for signed-in people the
  tooltip also names the place the forecast is for.
- Units follow the reader's browser: °F and inches for a United States locale,
  otherwise °C, mm and cm.
- Guests see the same line. They are not told the place, address or coordinates.

## Where the location comes from

The stay's place is asked first, then the area it sits in. Either can give:

- **Coordinates** typed in "Location for the map", in any coordinate system.
  They are used as typed and never converted: the difference between systems is
  under a kilometre, far below what a forecast can tell apart.
- **An address or place name**: the typed map location, else the place's
  address fields. It is looked up for the weather only (owner decision,
  November 17). The whole text is tried, then the part after the first comma.
  The result is cached on the server and **never written to the place**, so the
  map rules in [map-location.md](map-location.md) are unchanged: an address is
  still not positioned on the drawing.

When a day has several stays, the first one (in the trip's order) with a
forecast is used; a check-out morning uses the stay being left. The family
filter does not change it.

## Services and what is sent

| | Service | Key | Sent | Limits |
| --- | --- | --- | --- | --- |
| Forecast | [Open-Meteo](https://open-meteo.com/) | none | latitude and longitude rounded to two decimals (about 1 km) | 16 days; free tier is for non-commercial use with a daily request allowance and asks for attribution, which the note gives |
| Address lookup | OpenStreetMap Nominatim public server | none | the typed address text | at most one request a second, no uptime promise, weaker on some addresses; an identifying User-Agent is asked for |

Nothing else leaves the planner: no trip name, people, notes or identifiers.
Requests are made by the server (`lib/weather.mjs`), never by the browser.
A forecast is reused for an hour per location, a looked-up address for 30 days,
and a failure is not retried for five minutes. The cache is the worker's memory
plus the platform's edge cache where available; nothing is stored in the trip
or the database, and nothing goes through `commit()`/`transact()`.

Day boundaries are the stay's own: the forecast service is asked to work out the
time zone from the location and answers in that place's local days, and a day
that has already ended there is not shown.

## Code

- `lib/weather.mjs`: location of a stay, address lookup, forecast, caching,
  `tripWeather()`. `lib/weather-cache.ts`: the cache used by the routes.
- `app/api/weather/route.ts` (same access check as the trip) and
  `app/api/shared-weather/route.ts` (same token check as the guest schedule).
  Authorization is unchanged.
- `public/weather.mjs`: classification, words, icons, and filling the lines.
- `public/board.mjs` puts an empty fixed-height line in every day header;
  `planner.js` and `guest.mjs` fill it in place when the answer arrives.
- Offline shell cache is `waypoint-shell-v45` and includes the new module. The
  reading copy does not keep weather: offline, the lines stay empty.

## Checks

- `npm test`: 212 pass, 14 new in `tests/weather.test.mjs`, with the weather
  service mocked: rain, snow, mixed and dry rendering with precipitation first;
  no location; dates outside the range; a failed lookup; time-zone day
  boundaries; address lookup; caching; what is sent; guests.
- `scripts/check-weather-browser.cjs` (headless Chromium, local dev server,
  synthetic trip, made-up forecast): desktop three-column and week views, phone
  landscape and phone portrait. Header and first card are at the same height
  loading, with and without a forecast; no sideways scroll; guest view.
- Type check, lint (0 errors) and production build pass.

## Not verified

- **A live forecast.** Open-Meteo's response was not seen; the parser follows
  its published format. Its terms page could not be opened either, so confirm
  that a private family planner counts as non-commercial use.
- **A live address lookup**, including how well Nominatim finds rural
  addresses, and whether its usage policy is satisfied by a generic User-Agent.
- Whether the Sites host allows outbound requests to either service and offers
  the edge cache; without the cache, each worker instance keeps its own.
- A physical phone, a screen reader, the hosted Site, real trip data, and
  anything from mainland China.

## Screenshots (synthetic trip; the forecast is made up)

| Wet | Snowy | Dry | No forecast | Guest |
| --- | --- | --- | --- | --- |
| <img src="design/weather/phone-wet.jpg" width="180"> | <img src="design/weather/phone-snowy.jpg" width="180"> | <img src="design/weather/phone-dry.jpg" width="180"> | <img src="design/weather/phone-unavailable.jpg" width="180"> | <img src="design/weather/phone-guest.jpg" width="180"> |

Phone landscape:

<img src="design/weather/phone-landscape.jpg" width="700">

Desktop, larger cards and the week view (Nov 29 has no forecast):

<img src="design/weather/desktop.jpg" width="700">
<img src="design/weather/desktop-week.jpg" width="700">
