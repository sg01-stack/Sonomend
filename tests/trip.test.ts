import { describe, it, expect } from "vitest";
import { TripEngine, scoreCrossings } from "../src/trip";
import { demoFix, scriptedFrame } from "../src/demo";
import { SpectralDetector } from "../src/detector";
import demoZones from "../public/zones.json";
import type { Zone } from "../src/types";
const zones = demoZones as Zone[],
  base = 100000;
function demo(options: { event?: boolean; gps?: boolean; mic?: boolean } = {}) {
  const e = new TripEngine(zones, "demo-scripted", base);
  e.coverage("mic", true, base);
  for (let sec = 0; sec <= 60; sec++) {
    const now = base + sec * 1000;
    if (options.gps && sec >= 13 && sec < 19)
      e.coverage("gps", false, now, "Test dropout");
    else e.fix(demoFix(sec * 1000, base));
    if (options.mic && sec === 13)
      e.coverage("mic", false, now, "Test mic loss");
    if (options.mic && sec === 19) e.coverage("mic", true, now);
    if (options.event && sec === 45)
      e.detection({
        start: now,
        end: now + 300,
        match: 0.95,
        label: "Likely your horn",
      });
    e.tick(now);
  }
  return e.end(base + 60000);
}
describe("trip scoring", () => {
  it("awards exactly one point for each clean complete crossing", () => {
    const t = demo();
    expect(t.crossings).toHaveLength(2);
    expect(scoreCrossings(t).map((c) => c.outcome)).toEqual([
      "Point earned",
      "Point earned",
    ]);
  });
  it("flags own-horn matches for review in quiet zones and tags corners", () => {
    const t = demo({ event: true });
    expect(scoreCrossings(t).map((c) => c.outcome)).toEqual([
      "Point earned",
      "No point",
    ]);
    expect(t.events[0]).toMatchObject({ review: true, nearCorner: true });
    expect(t.events[0].location).toBeDefined();
  });
  it.each(["gps", "mic"] as const)(
    "prevents a quiet point when %s coverage is lost",
    (kind) => {
      const t = demo({ [kind]: true, event: true });
      expect(scoreCrossings(t)[0].outcome).toBe("Unscored");
      expect(scoreCrossings(t)[0].reasons.join()).toMatch(
        /coverage interrupted/,
      );
    },
  );
  it("keeps uncertain/unlocated sounds and blocks points during a crossing", () => {
    const e = new TripEngine(zones, "live", base);
    e.coverage("mic", true, base);
    for (let sec = 0; sec <= 60; sec++) {
      e.fix(demoFix(sec * 1000, base));
      if (sec === 15)
        e.detection({
          start: base + 15000,
          end: base + 15300,
          match: 0.3,
          label: "Uncertain",
        });
    }
    const t = e.end(base + 60000);
    expect(scoreCrossings(t)[0].outcome).toBe("No point");
    expect(t.events[0].review).toBe(false);
  });
  it("does not attach stale, weak, or interrupted GPS to events", () => {
    const e = new TripEngine(zones, "live", base);
    e.coverage("mic", true, base);
    e.fix(demoFix(0, base));
    e.detection({
      start: base + 6000,
      end: base + 6300,
      match: 0.95,
      label: "Likely your horn",
    });
    e.fix({ ...demoFix(7000, base), accuracy: 100 });
    e.detection({
      start: base + 7000,
      end: base + 7300,
      match: 0.95,
      label: "Likely your horn",
    });
    expect(e.trip.events.map((e) => e.location)).toEqual([
      undefined,
      undefined,
    ]);
  });
  it("excludes incomplete crossings and trips starting inside a zone", () => {
    const e = new TripEngine(zones, "live", base);
    e.coverage("mic", true, base);
    e.fix({ ...demoFix(0, base), longitude: 77.5946 });
    const score = scoreCrossings(e.end(base + 1000))[0];
    expect(score.outcome).toBe("Unscored");
    expect(score.reasons).toHaveLength(2);
  });
  it("does not award repeated points for drift around the boundary", () => {
    const z: Zone = {
      id: "test",
      name: "Test",
      latitude: 0,
      longitude: 0,
      radius: 80,
      type: "quiet zone",
    };
    const e = new TripEngine([z], "live", base);
    e.coverage("mic", true, base);
    const fix = (meters: number, sec: number) =>
      e.fix({
        at: base + sec * 1000,
        latitude: 0,
        longitude: meters / 111195,
        accuracy: 5,
      });
    fix(-180, 0);
    fix(-60, 1);
    fix(0, 2);
    fix(105, 3);
    for (let i = 4; i < 20; i++) fix(i % 2 ? 70 : 105, i);
    expect(e.trip.crossings).toHaveLength(1);
    expect(
      scoreCrossings(e.end(base + 20000)).filter(
        (c) => c.outcome === "Point earned",
      ),
    ).toHaveLength(1);
  });
  it("detects a stale interval even if no tick ran before the next GPS fix", () => {
    const e = new TripEngine(zones, "live", base);
    e.coverage("mic", true, base);
    e.fix(demoFix(0, base));
    e.fix(demoFix(10000, base));
    expect(e.trip.gaps).toContainEqual({
      kind: "gps",
      start: base + 5000,
      end: base + 10000,
      reason: "Position is more than 5 seconds old",
    });
  });
  it("revises a crossing after an overlapping event finishes outside the zone", () => {
    const t = demo();
    const e = new TripEngine(zones, "live", base);
    Object.assign(e.trip, t);
    const c = t.crossings[0];
    e.detection({
      start: c.end! - 100,
      end: c.end! + 100,
      match: 0.92,
      label: "Likely your horn",
    });
    expect(scoreCrossings(e.trip)[0].outcome).toBe("No point");
  });
  it("ignores fixes and events after ending; ending is idempotent", () => {
    const e = new TripEngine(zones, "live", base);
    const ended = e.end(base + 1000);
    e.fix(demoFix(2000, base));
    e.detection({
      start: base + 2000,
      end: base + 2300,
      match: 1,
      label: "Likely your horn",
    });
    expect(e.end(base + 2000)).toEqual(ended);
  });
  it("runs the scripted demo through the actual detector and engine", () => {
    const e = new TripEngine(zones, "demo-scripted", base);
    e.coverage("mic", true, base);
    const d = new SpectralDetector({
      version: 1,
      createdAt: base,
      noiseRms: 0.001,
      sampleLevels: [0.15],
      fingerprints: [[1, 0, 0, 0]],
      mode: "Spectral matching",
    });
    let nextFix = 0;
    for (let ms = 0; ms <= 60000; ms += 60) {
      if (ms >= nextFix) {
        e.fix(demoFix(nextFix, base));
        nextFix += 1000;
      }
      for (const event of d.push(scriptedFrame(base + ms, ms)))
        e.detection({ ...event, simulated: true });
      e.tick(base + ms);
    }
    const t = e.end(base + 60000);
    expect(t.events).toHaveLength(1);
    expect(t.events[0]).toMatchObject({
      review: true,
      nearCorner: true,
      simulated: true,
    });
    expect(scoreCrossings(t).map((c) => c.outcome)).toEqual([
      "Point earned",
      "No point",
    ]);
  });
});
