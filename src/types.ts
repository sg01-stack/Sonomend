export interface Zone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  type: "quiet zone" | "marked corner";
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
}
export interface Detection {
  start: number;
  end: number;
  match: number;
  label: "Likely your horn" | "Uncertain";
  simulated?: boolean;
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
export interface Trip {
  id: string;
  startedAt: number;
  endedAt?: number;
  mode: TripMode;
  detector: "Spectral matching";
  zones: Zone[];
  fixes: Fix[];
  events: HornEvent[];
  gaps: Gap[];
  crossings: Crossing[];
}
export interface Settings {
  matchThreshold: number;
  demoDropout: boolean;
}
