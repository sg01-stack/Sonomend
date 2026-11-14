import { describe, it, expect } from "vitest";
import { TripEngine } from "../src/trip";
import { scoreTrip } from "../src/scoring";
import { demoFix } from "../src/demo";
import zones from "../public/zones.json";
import type { Zone } from "../src/types";
function repeated(
  options: {
    gap?: boolean;
    uncertain?: boolean;
    located?: boolean;
    enabled?: boolean;
    long?: boolean;
  } = {},
) {
  const e = new TripEngine(zones as Zone[], "demo-scripted", 100000);
  e.trip.repeatPenalty = options.enabled ?? true;
  e.coverage("mic", true, 100000);
  for (let second = 0; second <= 60; second++) {
    const at = 100000 + second * 1000;
    e.fix(demoFix(second * 1000, 100000));
    if (options.gap && second === 45)
      e.coverage("mic", false, at, "Interrupted");
    if (options.gap && second === 47) e.coverage("mic", true, at);
    if ((options.long ? [44] : [44, 46, 48, 50]).includes(second))
      e.detection({
        start: at,
        end: at + (options.long ? 6000 : 500),
        label: options.uncertain ? "Uncertain" : "Likely your horn",
        match: 0.95,
      });
  }
  const t = e.end(160000);
  if (options.located === false)
    t.events.forEach((event) => (event.location = undefined));
  return t;
}
describe("repeat-honk adjustment", () => {
  it("deducts once per complete crossing, with a transparent review pattern", () => {
    const result = scoreTrip(repeated());
    expect(result.quietPoints).toBe(1);
    expect(result.deductions).toBe(1);
    expect(result.totalPoints).toBe(0);
    expect(result.repeats).toHaveLength(1);
    expect(result.repeats[0].eventIds).toHaveLength(3);
  });
  it.each([
    { gap: true },
    { uncertain: true },
    { located: false },
    { long: true },
  ])(
    "does not penalize missing coverage, uncertain/unlocated events, or a sustained honk: %j",
    (option) => {
      expect(scoreTrip(repeated(option)).deductions).toBe(0);
    },
  );
  it("preserves review without deduction when the saved trip rule is disabled", () => {
    const r = scoreTrip(repeated({ enabled: false }));
    expect(r.repeats).toHaveLength(1);
    expect(r.totalPoints).toBe(1);
  });
  it("does not change the scoring of older saved trips", () => {
    const t = repeated();
    delete t.repeatPenalty;
    expect(scoreTrip(t).deductions).toBe(0);
  });
  it("does not penalize events spaced more than ten seconds apart", () => {
    const t = repeated();
    t.events.forEach((e, i) => {
      e.start += i * 10000;
      e.end += i * 10000;
    });
    expect(scoreTrip(t).deductions).toBe(0);
  });
});
