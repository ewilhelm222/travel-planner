import { access, response, snapshot, failed } from "../../../lib/trip-store";
import { tripWeather } from "../../../lib/weather.mjs";
import { weatherCache } from "../../../lib/weather-cache";
export const dynamic = "force-dynamic";
// The forecast for each day's stay, for anyone who can open the trip. Read-only: nothing is saved.
// A stay with no usable location, a day outside the forecast range or a failed lookup is simply absent.
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    return response(await tripWeather(snapshot(a.row!).trip, { cache: weatherCache, names: true }));
}
catch (e) {
    return failed(e);
} }
