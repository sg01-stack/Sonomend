import { describe, it, expect, vi, afterEach } from "vitest";
import {
  coordinateDestination,
  parseRoute,
  guidance,
  demoRoute,
  maneuverText,
} from "../src/navigation/routing";
import { NavigationServices } from "../src/navigation/services";
const destination = { name: "Finish", latitude: 12.9736, longitude: 77.598 };
const response = {
  code: "Ok",
  routes: [
    {
      distance: 900,
      duration: 180,
      geometry: {
        coordinates: [
          [77.5925, 12.9716],
          [77.5945, 12.9716],
          [77.5945, 12.9736],
          [77.598, 12.9736],
        ],
      },
      legs: [
        {
          steps: [
            {
              name: "Start Road",
              maneuver: {
                type: "depart",
                modifier: "east",
                location: [77.5925, 12.9716],
              },
            },
            {
              name: "Garden Road",
              maneuver: {
                type: "turn",
                modifier: "left",
                location: [77.5945, 12.9716],
              },
            },
            {
              name: "Library Road",
              maneuver: {
                type: "turn",
                modifier: "right",
                location: [77.5945, 12.9736],
              },
            },
            {
              name: "",
              maneuver: { type: "arrive", location: [77.598, 12.9736] },
            },
          ],
        },
      ],
    },
  ],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("navigation and free service adapters", () => {
  it("accepts coordinate destinations without geocoding and rejects invalid latitude", () => {
    expect(coordinateDestination("12.9716, 77.598")).toMatchObject({
      latitude: 12.9716,
      longitude: 77.598,
    });
    expect(coordinateDestination("Library")).toBeUndefined();
    expect(() => coordinateDestination("999, 77")).toThrow("Latitude");
  });
  it("advances upcoming turns based on actual route geometry", () => {
    const route = parseRoute(response, destination);
    const first = guidance(route, {
      at: 0,
      latitude: 12.9716,
      longitude: 77.5925,
      accuracy: 5,
    });
    expect(first.instruction).toBe("Turn left onto Garden Road");
    expect(first.toTurn).toBeGreaterThan(200);
    const nearTurn = guidance(
      route,
      { at: 500, latitude: 12.9716, longitude: 77.59442, accuracy: 5 },
      first.offset,
    );
    expect(nearTurn.toTurn).toBeLessThan(10);
    expect(nearTurn.instruction).toBe("Turn left onto Garden Road");
    const next = guidance(
      route,
      { at: 1000, latitude: 12.9716, longitude: 77.5945, accuracy: 5 },
      first.offset,
    );
    expect(next.instruction).toBe("Turn right onto Library Road");
    expect(next.remaining).toBeLessThan(first.remaining);
  });
  it("detects arrival and off-route locations without faking traffic estimates", () => {
    const route = parseRoute(response, destination);
    expect(
      guidance(route, { at: 0, ...destination, accuracy: 5 }).arrived,
    ).toBe(true);
    expect(
      guidance(route, { at: 0, latitude: 12.98, longitude: 77.58, accuracy: 5 })
        .offRoute,
    ).toBe(true);
  });
  it("rejects missing routes and malformed provider geometry", () => {
    expect(() => parseRoute({ code: "NoRoute" }, destination)).toThrow(
      "No usable",
    );
    expect(() =>
      parseRoute(
        {
          ...response,
          routes: [
            {
              ...response.routes[0],
              geometry: {
                coordinates: [
                  [999, 0],
                  [0, 0],
                ],
              },
            },
          ],
        },
        destination,
      ),
    ).toThrow("No usable");
  });
  it("provides a deterministic local navigation route and readable roundabout instructions", () => {
    const route = demoRoute();
    expect(route.demo).toBe(true);
    expect(route.length).toBeGreaterThan(700);
    expect(
      maneuverText({ type: "roundabout", exit: 2 }, "Lake Road"),
    ).toContain("exit 2 onto Lake Road");
  });
  it("caches manual search and rate-limits uncached requests", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { display_name: "Library", lat: "12.97", lon: "77.59" },
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const s = new NavigationServices(),
      signal = new AbortController().signal;
    expect(await s.search("Library", signal)).toHaveLength(1);
    await s.search("Library", signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(s.search("Museum", signal)).rejects.toThrow("wait");
    expect(await s.search("12.97,77.59", signal)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("honors provider throttling and does not retry in a loop", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response("", { status: 429, headers: { "Retry-After": "60" } }),
      );
    vi.stubGlobal("fetch", fetcher);
    const s = new NavigationServices(),
      signal = new AbortController().signal;
    await expect(
      s.route(
        { at: 0, latitude: 12.97, longitude: 77.59, accuracy: 5 },
        destination,
        signal,
      ),
    ).rejects.toThrow("busy");
    await expect(
      s.route(
        { at: 0, latitude: 12.97, longitude: 77.59, accuracy: 5 },
        destination,
        signal,
      ),
    ).rejects.toThrow("rate-limited");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses lon-lat routing coordinates and includes a caller cancellation signal", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetcher);
    await new NavigationServices().route(
      { at: 0, latitude: 12.97, longitude: 77.59, accuracy: 5 },
      destination,
      new AbortController().signal,
    );
    expect(fetcher.mock.calls[0][0]).toContain("77.59,12.97;77.598,12.9736");
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
