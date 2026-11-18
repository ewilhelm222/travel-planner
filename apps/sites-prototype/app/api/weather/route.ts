import { access, response, snapshot, failed } from "../../../lib/trip-store";
import { weatherPlan } from "../../../lib/weather.mjs";
import { weatherCache } from "../../../lib/weather-cache";
export const dynamic = "force-dynamic";
// Where each day's weather is for (rounded coordinates), for anyone who can open the trip. The browser
// then asks the forecast service itself. Read-only: nothing is saved. A stay with no usable location is absent.
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    return response(await weatherPlan(snapshot(a.row!).trip, { cache: weatherCache, names: true }));
}
catch (e) {
    return failed(e);
} }
