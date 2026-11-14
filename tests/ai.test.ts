import { describe, it, expect } from "vitest";
import {
  matchWithAi,
  MODEL_ID,
  personalSimilarity,
  selectCalibrationFrame,
  type AiFrame,
} from "../src/ai/matching";
import type { Calibration, Detection } from "../src/types";
const calibration: Calibration = {
  version: 1,
  createdAt: 0,
  mode: "Spectral matching",
  noiseRms: 0.001,
  sampleLevels: [0.1, 0.1, 0.1],
  fingerprints: [
    [1, 0],
    [1, 0],
    [1, 0],
  ],
  ai: {
    modelId: MODEL_ID,
    background: [0, 1, 0],
    embeddings: [
      [1, 0, 0],
      [1, 0, 0],
      [1, 0, 0],
    ],
    hornScores: [0.8, 0.8, 0.8],
  },
};
const event: Detection = {
  start: 1000,
  end: 1500,
  match: 0.95,
  label: "Likely your horn",
};
const frame: AiFrame = {
  start: 900,
  end: 1875,
  embedding: [1, 0, 0],
  hornScore: 0.8,
  rms: 0.1,
  inferenceMs: 20,
};
describe("personal AI evidence", () => {
  it("requires general horn evidence and a matching private fingerprint", () => {
    expect(matchWithAi(event, calibration, [frame])).toMatchObject({
      label: "Likely your horn",
      detectorMode: "YAMNet + personal matching",
      ai: { embeddingMatch: 1, hornScore: 0.8 },
    });
  });
  it("does not identify a different horn as the calibrated vehicle", () => {
    expect(
      matchWithAi(event, calibration, [{ ...frame, embedding: [0, 0, 1] }])
        .label,
    ).toBe("Uncertain");
  });
  it("downgrades a spectral lookalike when AI lacks horn evidence", () => {
    expect(
      matchWithAi(event, calibration, [{ ...frame, hornScore: 0.01 }]).label,
    ).toBe("Uncertain");
  });
  it("requires agreement from at least two calibration samples", () => {
    expect(
      personalSimilarity(
        [1, 0, 0],
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
      ),
    ).toBe(0.5);
  });
  it("rejects resemblance to background noise and weak spectral agreement", () => {
    expect(
      matchWithAi(
        event,
        { ...calibration, ai: { ...calibration.ai!, background: [1, 0, 0] } },
        [frame],
      ).label,
    ).toBe("Uncertain");
    expect(
      matchWithAi({ ...event, match: 0.6 }, calibration, [frame]).label,
    ).toBe("Uncertain");
  });
  it("preserves spectral fallback and labels its reason for old or missing evidence", () => {
    expect(
      matchWithAi(event, { ...calibration, ai: undefined }, [frame]),
    ).toMatchObject({
      detectorMode: "Spectral matching",
      fallbackReason: expect.stringContaining("Recalibrate"),
    });
    expect(matchWithAi(event, calibration, []).fallbackReason).toContain(
      "No complete",
    );
  });
  it("only calibrates complete, loud, horn-positive frames from the current sample", () => {
    expect(selectCalibrationFrame([frame], 900, 1900, 0.001)).toEqual(frame);
    expect(selectCalibrationFrame([frame], 1000, 1900, 0.001)).toBeUndefined();
    expect(
      selectCalibrationFrame([{ ...frame, hornScore: 0.02 }], 900, 1900, 0.001),
    ).toBeUndefined();
  });
});
