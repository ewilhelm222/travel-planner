import { memoryCache } from "./weather.mjs";
// Forecasts and address lookups are kept in this worker's memory and, where the platform offers it, in the
// edge cache, keyed only by rounded coordinates or the address text. No trip is named in a key.
const memory = memoryCache();
const edge = () => (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
const address = (key: string) => `https://weather-cache.invalid/${encodeURIComponent(key)}`;
export const weatherCache = {
    async get(key: string) {
        const local = await memory.get(key);
        if (local)
            return local;
        try {
            const hit = await edge()?.match(address(key));
            return hit ? await hit.json() : null;
        }
        catch {
            return null;
        }
    },
    async put(key: string, value: unknown, ttl: number) {
        await memory.put(key, value, ttl);
        try {
            await edge()?.put(address(key), Response.json(value, { headers: { "Cache-Control": `public, max-age=${ttl}` } }));
        }
        catch { /* memory only */ }
    },
};
