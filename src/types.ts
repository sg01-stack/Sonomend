export interface Zone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  type: "quiet zone" | "marked corner" | "road opening";
}
export interface Fix {
  at: number;
  latitude: number;
  longitude: number;
  accuracy: number;
}
export interface Frame {
  at: number;
  rms: number;
  spectrum: number[];
}
export interface Calibration {
  version: 1;
  createdAt: number;
  noiseRms: number;
  fingerprints: number[][];
  sampleLevels: number[];
  mode: "Spectral matching";
  ai?: {
    modelId: string;
    embeddings: number[][];
    background: number[];
    hornScores: number[];
  };
}
export interface Detection {
  start: number;
  end: number;
  match: number;
  label: "Likely your horn" | "Uncertain";
  simulated?: boolean;
  detectorMode?: DetectorMode;
  fallbackReason?: string;
  ai?: {
    hornScore: number;
    embeddingMatch: number;
    backgroundMatch: number;
    spectralMatch: number;
    inferenceMs: number;
  };
}
export interface HornEvent extends Detection {
  id: string;
  location?: Fix;
  zoneIds: string[];
  review: boolean;
  nearCorner: boolean;
}
export interface Gap {
  kind: "mic" | "gps";
  start: number;
  end?: number;
  reason: string;
}
export interface Crossing {
  id: string;
  zoneId: string;
  start: number;
  end?: number;
  initialInside: boolean;
}
export interface ScoredCrossing extends Crossing {
  outcome: "Point earned" | "No point" | "Unscored";
  reasons: string[];
}
export type TripMode = "live" | "demo-mic" | "demo-scripted";
export type DetectorMode = "Spectral matching" | "YAMNet + personal matching";
export interface Trip {
  scoringVersion?: 2;
  id: string;
  startedAt: number;
  endedAt?: number;
  mode: TripMode;
  detector: DetectorMode;
  repeatPenalty?: boolean;
  zones: Zone[];
  fixes: Fix[];
  events: HornEvent[];
  gaps: Gap[];
  crossings: Crossing[];
}
export interface Settings {
  scoreTimeZone?: string;
  matchThreshold: number;
  demoDropout: boolean;
  aiEnabled?: boolean;
  repeatPenalty?: boolean;
  demoRepeats?: boolean;
}
