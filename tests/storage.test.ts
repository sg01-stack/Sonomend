import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import {
  saveCalibration,
  loadCalibration,
  saveTrip,
  latestTrip,
  tripHistory,
  saveSettings,
  loadSettings,
} from "../src/storage";
import { TripEngine } from "../src/trip";
it("round-trips fingerprints, settings, history and the latest report through IndexedDB", async () => {
  const c = {
    version: 1 as const,
    createdAt: 100,
    noiseRms: 0.003,
    sampleLevels: [0.1, 0.1, 0.1],
    fingerprints: [
      [1, 0],
      [1, 0],
      [1, 0],
    ],
    mode: "Spectral matching" as const,
  };
  await saveCalibration(c);
  expect(await loadCalibration()).toEqual(c);
  const first = new TripEngine([], "live", 100).end(200),
    last = new TripEngine([], "demo-scripted", 300).end(400);
  await saveTrip(first);
  await saveTrip(last);
  expect(await latestTrip()).toEqual(last);
  expect(await tripHistory()).toEqual([last, first]);
  await saveSettings({ matchThreshold: 0.9, demoDropout: true });
  expect(await loadSettings()).toEqual({
    matchThreshold: 0.9,
    demoDropout: true,
  });
});
