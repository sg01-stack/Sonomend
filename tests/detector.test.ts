import { describe, it, expect } from "vitest";
import { fingerprint, SpectralDetector } from "../src/detector";
import type { Calibration, Detection, Frame } from "../src/types";
const calibration: Calibration = {
  version: 1,
  createdAt: 0,
  noiseRms: 0.002,
  sampleLevels: [0.1, 0.12, 0.1],
  fingerprints: [
    [1, 0, 0],
    [1, 0, 0],
    [1, 0, 0],
  ],
  mode: "Spectral matching",
};
const frame = (at: number, loud = true, spectrum = [1, 0, 0]): Frame => ({
  at,
  rms: loud ? 0.15 : 0.001,
  spectrum,
});
describe("spectral detector", () => {
  it("counts a sustained horn once", () => {
    const d = new SpectralDetector(calibration),
      events: Detection[] = [];
    for (let at = 0; at < 3000; at += 60)
      events.push(...d.push(frame(at, at < 2100)));
    expect(events).toHaveLength(1);
    expect(events[0].label).toBe("Likely your horn");
    expect(events[0].match).toBe(1);
  });
  it("counts two honks separated by a clear gap twice", () => {
    const d = new SpectralDetector(calibration),
      events: Detection[] = [];
    for (let at = 0; at < 3000; at += 60)
      events.push(...d.push(frame(at, at < 600 || (at >= 1500 && at < 2100))));
    expect(events).toHaveLength(2);
  });
  it("merges adjacent positive windows across a brief pause", () => {
    const d = new SpectralDetector(calibration),
      events: Detection[] = [];
    for (let at = 0; at < 2500; at += 60)
      events.push(...d.push(frame(at, at < 600 || (at >= 780 && at < 1500))));
    expect(events).toHaveLength(1);
  });
  it("labels loud low-similarity distractors uncertain, never confirmed", () => {
    const d = new SpectralDetector(calibration);
    for (let at = 0; at < 600; at += 60) d.push(frame(at, true, [0, 0, 1]));
    expect(d.flush()).toMatchObject([{ label: "Uncertain", match: 0 }]);
  });
  it("rejects background and a single impulse", () => {
    const d = new SpectralDetector(calibration);
    expect(d.push(frame(0))).toEqual([]);
    expect(d.push(frame(600, false))).toEqual([]);
    expect(d.flush()).toEqual([]);
  });
  it("rejects silent calibration and extracts a loud fingerprint", () => {
    expect(() =>
      fingerprint(
        Array.from({ length: 20 }, (_, i) => frame(i * 60, false)),
        0.002,
      ),
    ).toThrow("No clear honk");
    expect(
      fingerprint(
        Array.from({ length: 20 }, (_, i) => frame(i * 60)),
        0.002,
      ).vector,
    ).toEqual([1, 0, 0]);
  });
});
