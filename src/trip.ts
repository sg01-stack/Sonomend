import type {
  Crossing,
  Detection,
  Fix,
  Gap,
  ScoredCrossing,
  Trip,
  TripMode,
  Zone,
} from "./types";

export const MAX_FIX_AGE = 5000;
export const MAX_ACCURACY = 35;
export function distance(
  a: Pick<Fix, "latitude" | "longitude">,
  b: Pick<Fix, "latitude" | "longitude">,
): number {
  const rad = Math.PI / 180,
    dlat = (b.latitude - a.latitude) * rad,
    dlon = (b.longitude - a.longitude) * rad;
  return (
    6371000 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dlat / 2) ** 2 +
            Math.cos(a.latitude * rad) *
              Math.cos(b.latitude * rad) *
              Math.sin(dlon / 2) ** 2,
        ),
      ),
    )
  );
}
export function usable(f: Fix) {
  return (
    Number.isFinite(f.latitude) &&
    Math.abs(f.latitude) <= 90 &&
    Number.isFinite(f.longitude) &&
    Math.abs(f.longitude) <= 180 &&
    Number.isFinite(f.accuracy) &&
    f.accuracy >= 0 &&
    f.accuracy <= MAX_ACCURACY
  );
}
const overlaps = (a: number, b: number, c: number, d: number) =>
  a <= d && c <= b;
export function scoreCrossings(trip: Trip): ScoredCrossing[] {
  return trip.crossings.map((c) => {
    const end = c.end ?? trip.endedAt ?? Infinity;
    const reasons: string[] = [];
    if (c.initialInside)
      reasons.push("Trip began inside this zone; entry was not observed.");
    if (!c.end) reasons.push("Incomplete traversal: no usable exit recorded.");
    for (const g of trip.gaps)
      if (
        (g.end ?? Infinity) > g.start &&
        overlaps(c.start, end, g.start, g.end ?? Infinity)
      )
        reasons.push(
          `${g.kind === "mic" ? "Microphone" : "GPS"} coverage interrupted: ${g.reason}`,
        );
    if (reasons.length)
      return { ...c, outcome: "Unscored", reasons: [...new Set(reasons)] };
    const events = trip.events.filter((e) =>
      overlaps(c.start, end, e.start, e.end),
    );
    if (events.length)
      return {
        ...c,
        outcome: "No point",
        reasons: [
          "A likely or uncertain detection occurred during this crossing.",
        ],
      };
    return {
      ...c,
      outcome: "Point earned",
      reasons: [
        "Complete crossing with usable microphone and GPS coverage and no detections.",
      ],
    };
  });
}
export class TripEngine {
  readonly trip: Trip;
  private zoneState = new Map<
    string,
    { initialized: boolean; armed: boolean; crossing?: Crossing }
  >();
  private activeGaps = new Map<Gap["kind"], Gap>();
  private lastFix?: Fix;
  private stopped = false;
  constructor(zones: Zone[], mode: TripMode, at: number) {
    this.trip = {
      id: crypto.randomUUID(),
      startedAt: at,
      mode,
      detector: "Spectral matching",
      zones: structuredClone(zones),
      fixes: [],
      events: [],
      gaps: [],
      crossings: [],
    };
    for (const z of zones.filter((z) => z.type === "quiet zone"))
      this.zoneState.set(z.id, { initialized: false, armed: false });
    this.coverage("mic", false, at, "Waiting for microphone");
    this.coverage("gps", false, at, "Waiting for a usable position");
  }
  coverage(
    kind: Gap["kind"],
    available: boolean,
    at: number,
    reason = "Signal unavailable",
  ) {
    if (this.stopped) return;
    const current = this.activeGaps.get(kind);
    if (available && current) {
      current.end = at;
      this.activeGaps.delete(kind);
    } else if (!available && !current) {
      const gap = { kind, start: at, reason };
      this.activeGaps.set(kind, gap);
      this.trip.gaps.push(gap);
    }
  }
  gap(kind: Gap["kind"], start: number, end: number, reason: string) {
    if (!this.stopped && end > start)
      this.trip.gaps.push({ kind, start, end, reason });
  }
  tick(at: number) {
    if (this.lastFix && at - this.lastFix.at > MAX_FIX_AGE)
      this.coverage(
        "gps",
        false,
        this.lastFix.at + MAX_FIX_AGE,
        "Position is more than 5 seconds old",
      );
  }
  fix(f: Fix) {
    if (this.stopped) return;
    this.tick(f.at);
    this.trip.fixes.push({ ...f });
    if (!usable(f)) {
      this.coverage(
        "gps",
        false,
        f.at,
        `Reported accuracy exceeds ${MAX_ACCURACY} m or position is invalid`,
      );
      return;
    }
    this.lastFix = f;
    this.coverage("gps", true, f.at);
    for (const z of this.trip.zones.filter((z) => z.type === "quiet zone")) {
      const state = this.zoneState.get(z.id)!,
        d = distance(f, z);
      const inside = d + f.accuracy < z.radius;
      const outside = d - f.accuracy > z.radius + 15;
      if (!state.initialized) {
        state.initialized = true;
        state.armed = outside;
        if (inside) this.enter(z.id, f.at, true);
      } else if (state.crossing && outside) {
        state.crossing.end = f.at;
        state.crossing = undefined;
        state.armed = false;
      } else if (
        !state.crossing &&
        !state.armed &&
        d - f.accuracy > z.radius + 40
      )
        state.armed = true;
      else if (!state.crossing && state.armed && inside)
        this.enter(z.id, f.at, false);
    }
  }
  private enter(zoneId: string, at: number, initialInside: boolean) {
    const crossing = {
      id: crypto.randomUUID(),
      zoneId,
      start: at,
      initialInside,
    };
    this.trip.crossings.push(crossing);
    this.zoneState.get(zoneId)!.crossing = crossing;
  }
  detection(d: Detection) {
    if (this.stopped) return;
    const location = [...this.trip.fixes]
      .reverse()
      .find(
        (f) => f.at <= d.start && d.start - f.at <= MAX_FIX_AGE && usable(f),
      );
    const badGps = this.trip.gaps.some(
      (g) =>
        g.kind === "gps" &&
        g.start <= d.start &&
        (g.end === undefined || g.end > d.start),
    );
    const fix = badGps ? undefined : location;
    const zones = fix
      ? this.trip.zones.filter(
          (z) => distance(fix, z) <= z.radius + fix.accuracy,
        )
      : [];
    this.trip.events.push({
      ...d,
      id: crypto.randomUUID(),
      location: fix,
      zoneIds: zones.map((z) => z.id),
      review:
        d.label === "Likely your horn" &&
        zones.some((z) => z.type === "quiet zone"),
      nearCorner: zones.some((z) => z.type === "marked corner"),
    });
  }
  end(at: number): Trip {
    if (!this.stopped) {
      this.tick(at);
      this.trip.endedAt = at;
      for (const g of this.activeGaps.values()) g.end = at;
      this.stopped = true;
    }
    return structuredClone(this.trip);
  }
  available(kind: Gap["kind"]) {
    return !this.activeGaps.has(kind);
  }
}
