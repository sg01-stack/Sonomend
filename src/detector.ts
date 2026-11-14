import type { Calibration, Detection, Frame } from "./types";

export const WINDOW_MS = 60;
export const EVENT_GAP_MS = 480;
export function normalize(values: number[]): number[] {
  const norm = Math.hypot(...values);
  return values.map((v) => (norm ? v / norm : 0));
}
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  const na = normalize(a),
    nb = normalize(b);
  return Math.max(
    0,
    Math.min(
      1,
      na.reduce((sum, x, i) => sum + x * nb[i], 0),
    ),
  );
}
export function fingerprint(
  frames: Frame[],
  noise: number,
): { vector: number[]; level: number } {
  const loud = frames
    .filter((f) => f.rms > Math.max(0.012, noise * 2.8))
    .sort((a, b) => b.rms - a.rms);
  if (loud.length < 4)
    throw new Error(
      "No clear honk captured. Move closer or honk briefly during the sample, then retry.",
    );
  const chosen = loud.slice(0, Math.max(4, Math.ceil(loud.length * 0.65)));
  return {
    vector: normalize(
      chosen[0].spectrum.map(
        (_, i) =>
          chosen.reduce((s, f) => s + normalize(f.spectrum)[i], 0) /
          chosen.length,
      ),
    ),
    level: chosen.reduce((s, f) => s + f.rms, 0) / chosen.length,
  };
}

/** Replace this implementation with a model-backed detector without changing trip logic. */
export interface Detector {
  push(frame: Frame): Detection[];
  flush(): Detection[];
  reset(): void;
}
export class SpectralDetector implements Detector {
  private active?: { start: number; end: number; matches: number[] };
  constructor(
    private calibration: Calibration,
    private threshold = 0.9,
  ) {}
  push(frame: Frame): Detection[] {
    const output: Detection[] = [];
    if (this.active && frame.at - this.active.end >= EVENT_GAP_MS)
      output.push(...this.flush());
    const gate = Math.max(
      0.012,
      this.calibration.noiseRms * 3,
      Math.min(...this.calibration.sampleLevels) * 0.15,
    );
    if (frame.rms < gate) return output;
    const score = Math.max(
      ...this.calibration.fingerprints.map((p) => cosine(p, frame.spectrum)),
    );
    // Loud low-similarity sounds are only uncertain candidates; this is not a horn classifier.
    if (score < 0.55 && frame.rms < gate * 2) return output;
    if (!this.active)
      this.active = { start: frame.at, end: frame.at, matches: [] };
    this.active.end = frame.at;
    this.active.matches.push(score);
    return output;
  }
  flush(): Detection[] {
    const a = this.active;
    this.active = undefined;
    if (!a || a.matches.length < 3 || a.end - a.start < 120) return [];
    const match = a.matches.reduce((s, v) => s + v, 0) / a.matches.length;
    return [
      {
        start: a.start,
        end: a.end,
        match,
        label: match >= this.threshold ? "Likely your horn" : "Uncertain",
      },
    ];
  }
  reset() {
    this.active = undefined;
  }
}
