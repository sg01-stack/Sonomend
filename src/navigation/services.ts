import {
  coordinateDestination,
  parseRoute,
  validCoordinate,
  type Destination,
} from "./routing";
import type { Fix } from "../types";
// Replace these endpoints for a higher-volume deployment; these are public demo/community services.
export const MAP_SERVICES = {
  tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  search: "https://nominatim.openstreetmap.org/search",
  route: "https://router.project-osrm.org/route/v1/driving/",
};
export class NavigationServices {
  private lastSearch = -Infinity;
  private blockedUntil = 0;
  private searches = new Map<string, Destination[]>();
  async search(query: string, signal: AbortSignal): Promise<Destination[]> {
    const coordinates = coordinateDestination(query);
    if (coordinates) return [coordinates];
    const q = query.trim();
    if (q.length < 3)
      throw new Error("Enter a place name or latitude, longitude.");
    if (this.searches.has(q)) return this.searches.get(q)!;
    if (Date.now() - this.lastSearch < 1100)
      throw new Error("Please wait a moment before searching again.");
    this.lastSearch = Date.now();
    const url = new URL(MAP_SERVICES.search);
    url.search = new URLSearchParams({
      q,
      format: "jsonv2",
      limit: "5",
    }).toString();
    const data = await this.json(url.href, signal);
    if (!Array.isArray(data))
      throw new Error("Search is unavailable. Try coordinates instead.");
    const results = data
      .slice(0, 5)
      .filter((x) => validCoordinate([Number(x.lon), Number(x.lat)]))
      .map((x) => ({
        name: String(x.display_name ?? "Destination"),
        latitude: Number(x.lat),
        longitude: Number(x.lon),
      }));
    this.searches.set(q, results);
    return results;
  }
  async route(origin: Fix, destination: Destination, signal: AbortSignal) {
    const points = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const data = await this.json(
      `${MAP_SERVICES.route}${points}?overview=full&geometries=geojson&steps=true`,
      signal,
    );
    return parseRoute(data, destination);
  }
  private async json(url: string, signal: AbortSignal) {
    if (Date.now() < this.blockedUntil)
      throw new Error(
        "Map service is rate-limited. Wait before retrying; horn scoring remains active.",
      );
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new Error(
        "Online maps could not connect. Check your connection or retry later. Horn scoring is still active.",
      );
    }
    if (response.status === 429) {
      const header = response.headers.get("Retry-After") ?? "",
        seconds = Number(header),
        date = Date.parse(header);
      this.blockedUntil =
        Number.isFinite(seconds) && seconds > 0
          ? Date.now() + seconds * 1000
          : Number.isFinite(date) && date > Date.now()
            ? date
            : Date.now() + 60000;
      throw new Error("Map service is busy. Please wait before retrying.");
    }
    if (!response.ok)
      throw new Error(
        `Map service unavailable (${response.status}). Retry later.`,
      );
    return response.json();
  }
}
