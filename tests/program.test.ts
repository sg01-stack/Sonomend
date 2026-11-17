import { test, expect } from "vitest";
import { programLedger, programPenalties } from "../src/program";
import type { Trip } from "../src/types";
const at = Date.UTC(2026, 10, 1, 10);
const make = (id = "t"): Trip => ({
  scoringVersion: 2,
  id,
  startedAt: at,
  endedAt: at + 60000,
  mode: "live",
  detector: "Spectral matching",
  zones: [],
  crossings: [],
  fixes: [{ at, latitude: 0, longitude: 0, accuracy: 5 }],
  gaps: [],
  events: [],
});
test("daily awards wait for day end and are idempotent; demos excluded", () => {
  const t = make();
  expect(programLedger([t], at + 3600000, "Asia/Kolkata").points).toBe(0);
  expect(programLedger([t, t], at + 86400000, "Asia/Kolkata").points).toBe(5);
  t.mode = "demo-scripted";
  expect(programLedger([t], at + 86400000, "Asia/Kolkata").points).toBe(0);
});
test("20 fully observed clean days produce 100 points and one reward", () => {
  const trips = Array.from({ length: 20 }, (_, i) => ({
    ...make(String(i)),
    startedAt: at + i * 86400000,
    endedAt: at + i * 86400000 + 60000,
  }));
  expect(
    programLedger(trips, at + 21 * 86400000, "Asia/Kolkata"),
  ).toMatchObject({ points: 100, rewards: 1, progress: 0 });
});
test("two or more separate horns make one penalty and prevent the day bonus", () => {
  const t = make();
  t.events = [0, 2000, 4000].map((offset, i) => ({
    id: String(i),
    start: at + offset,
    end: at + offset + 500,
    label: "Likely your horn",
    match: 0.95,
    zoneIds: [],
    nearCorner: false,
    review: false,
  }));
  expect(programPenalties(t)).toHaveLength(1);
  expect(programLedger([t], at + 86400000, "Asia/Kolkata")).toMatchObject({
    penalties: 1,
    points: 0,
  });
});
test("missing coverage cannot create a fully observed clean day", () => {
  const t = make();
  t.gaps = [{ kind: "mic", start: at + 1000, end: at + 2000, reason: "lost" }];
  expect(programLedger([t], at + 86400000, "Asia/Kolkata").points).toBe(0);
});

test("corner silence penalizes only complete continuous crossings; uncertain audio does not", () => {
  const t = make();
  t.zones = [
    {
      id: "corner",
      name: "Corner",
      latitude: 0,
      longitude: 0,
      radius: 55,
      type: "marked corner",
    },
  ];
  t.crossings = [
    {
      id: "c",
      zoneId: "corner",
      start: at + 5000,
      end: at + 10000,
      initialInside: false,
    },
  ];
  expect(programPenalties(t)).toHaveLength(1);
  t.events = [
    {
      id: "u",
      start: at + 7000,
      end: at + 7500,
      label: "Uncertain",
      match: 0.7,
      zoneIds: [],
      review: false,
      nearCorner: false,
    },
  ];
  expect(programPenalties(t)).toHaveLength(0);
  t.events = [];
  t.gaps = [{ kind: "gps", start: at + 6000, end: at + 8000, reason: "lost" }];
  expect(programPenalties(t)).toHaveLength(0);
});
test("two within five seconds counts once for a long burst; separated bursts count twice", () => {
  const t = make();
  const event = (offset: number, i: number) => ({
    id: String(i),
    start: at + offset,
    end: at + offset + 200,
    label: "Likely your horn" as const,
    match: 0.95,
    zoneIds: [],
    review: false,
    nearCorner: false,
  });
  t.events = [0, 5000, 7000, 9000, 11000].map(event);
  expect(programPenalties(t)).toHaveLength(1);
  t.events = [0, 2000, 10000, 12000].map(event);
  expect(programPenalties(t)).toHaveLength(2);
  t.events = [0, 5001].map(event);
  expect(programPenalties(t)).toHaveLength(0);
});
test("startup GPS acquisition is excluded, later interruption blocks a day bonus", () => {
  const t = make();
  t.fixes[0].at = at + 2000;
  t.gaps = [{ kind: "gps", start: at, end: at + 2000, reason: "Waiting" }];
  expect(programLedger([t], at + 86400000, "Asia/Kolkata").points).toBe(5);
  t.gaps.push({
    kind: "mic",
    start: at + 3000,
    end: at + 4000,
    reason: "Lost",
  });
  expect(programLedger([t], at + 86400000, "Asia/Kolkata").points).toBe(0);
});

test("real crossing engine records a missed mapped corner only in the new scoring version", async () => {
  const { TripEngine } = await import("../src/trip");
  const { demoFix } = await import("../src/demo");
  const zone = {
    id: "c",
    name: "Demo corner",
    latitude: 12.9716,
    longitude: 77.5982,
    radius: 55,
    type: "marked corner" as const,
  };
  const engine = new TripEngine([zone], "demo-mic", at);
  engine.trip.scoringVersion = 2;
  engine.coverage("mic", true, at);
  for (let second = 0; second <= 60; second++)
    engine.fix(demoFix(second * 1000, at));
  expect(programPenalties(engine.end(at + 60000))).toHaveLength(1);
});
