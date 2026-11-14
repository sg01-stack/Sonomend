import { cosine } from "../detector";
import type { Calibration, Detection } from "../types";
export const MODEL_ID = "yamnet-int8-sonomend-v1";
export interface AiFrame {
  start: number;
  end: number;
  embedding: number[];
  hornScore: number;
  inferenceMs: number;
  rms: number;
}
export function personalSimilarity(
  embedding: number[],
  references: number[][],
) {
  // Require support from two independent calibration honks, not a single outlier.
  const scores = references
    .map((r) => cosine(embedding, r))
    .sort((a, b) => b - a);
  return scores.length >= 2 ? (scores[0] + scores[1]) / 2 : 0;
}
export function matchWithAi(
  d: Detection,
  calibration: Calibration,
  frames: AiFrame[],
): Detection {
  if (calibration.ai?.modelId !== MODEL_ID)
    return spectralFallback(
      d,
      "Recalibrate to create your personal AI fingerprint",
    );
  const candidates = frames.filter(
    (f) =>
      f.start <= d.end &&
      f.end >= d.start &&
      f.rms > Math.max(0.006, calibration.noiseRms * 1.5),
  );
  if (!candidates.length)
    return spectralFallback(d, "No complete AI window for this event");
  // Select the strongest horn evidence, then compare its own embedding (never mix windows).
  const f = candidates.reduce((best, f) =>
    f.hornScore > best.hornScore ? f : best,
  );
  const embeddingMatch = personalSimilarity(
    f.embedding,
    calibration.ai.embeddings,
  );
  const backgroundMatch = cosine(f.embedding, calibration.ai.background);
  const match = 0.65 * embeddingMatch + 0.35 * d.match;
  const likely =
    f.hornScore >= 0.2 &&
    embeddingMatch >= 0.82 &&
    d.match >= 0.75 &&
    embeddingMatch - backgroundMatch >= 0.08;
  return {
    ...d,
    match,
    label: likely ? "Likely your horn" : "Uncertain",
    detectorMode: "YAMNet + personal matching",
    ai: {
      hornScore: f.hornScore,
      embeddingMatch,
      backgroundMatch,
      spectralMatch: d.match,
      inferenceMs: f.inferenceMs,
    },
  };
}
export function spectralFallback(d: Detection, reason: string): Detection {
  return { ...d, detectorMode: "Spectral matching", fallbackReason: reason };
}
export function selectCalibrationFrame(
  frames: AiFrame[],
  start: number,
  end: number,
  noise: number,
  background?: number[],
) {
  const candidates = frames.filter(
    (f) =>
      f.start >= start &&
      f.end <= end &&
      f.rms > Math.max(0.012, noise * 2.8) &&
      f.hornScore >= 0.15 &&
      (!background || cosine(f.embedding, background) < 0.92),
  );
  return candidates.sort((a, b) => b.hornScore - a.hornScore)[0];
}
