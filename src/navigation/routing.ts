import { distance } from "../trip";
import type { Fix } from "../types";
export type Coordinate = [number, number]; // longitude, latitude
export interface Destination {
  name: string;
  latitude: number;
  longitude: number;
}
export interface RouteStep {
  instruction: string;
  at: number;
}
export interface DrivingRoute {
  coordinates: Coordinate[];
  cumulative: number[];
  length: number;
  distance: number;
  duration: number;
  steps: RouteStep[];
  destination: Destination;
  demo?: boolean;
}
export const asFix = (p: Coordinate) => ({ longitude: p[0], latitude: p[1] });
export function validCoordinate(p: unknown): p is Coordinate {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
  );
}
export function coordinateDestination(text: string): Destination | undefined {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return;
  const latitude = Number(m[1]),
    longitude = Number(m[2]);
  if (!validCoordinate([longitude, latitude]))
    throw new Error("Latitude must be −90…90 and longitude −180…180.");
  return {
    name: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    latitude,
    longitude,
  };
}
export function cumulativeDistances(coordinates: Coordinate[]) {
  const out = [0];
  for (let i = 1; i < coordinates.length; i++)
    out.push(
      out[i - 1] + distance(asFix(coordinates[i - 1]), asFix(coordinates[i])),
    );
  return out;
}
export function project(
  route: Pick<DrivingRoute, "coordinates" | "cumulative">,
  fix: Pick<Fix, "latitude" | "longitude">,
  previous = 0,
) {
  let best = { offset: 0, distance: Infinity };
  const sx = 111195 * Math.cos((fix.latitude * Math.PI) / 180),
    sy = 111195;
  for (let i = 1; i < route.coordinates.length; i++) {
    const a = route.coordinates[i - 1],
      b = route.coordinates[i];
    const ax = (a[0] - fix.longitude) * sx,
      ay = (a[1] - fix.latitude) * sy,
      dx = (b[0] - a[0]) * sx,
      dy = (b[1] - a[1]) * sy;
    const t = Math.max(
      0,
      Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
    );
    const d = Math.hypot(ax + t * dx, ay + t * dy),
      offset =
        route.cumulative[i - 1] +
        t * (route.cumulative[i] - route.cumulative[i - 1]);
    if (
      d < best.distance - 0.5 ||
      (Math.abs(d - best.distance) <= 0.5 &&
        Math.abs(offset - previous) < Math.abs(best.offset - previous))
    )
      best = { offset, distance: d };
  }
  return best;
}
export function maneuverText(
  m: { type?: string; modifier?: string; exit?: number },
  road: string,
) {
  const direction = (m.modifier ?? "").replaceAll("-", " "),
    onto = road ? ` onto ${road}` : "";
  if (m.type === "arrive") return "Arrive at your destination";
  if (m.type === "depart")
    return `Head ${direction || "along the route"}${road ? ` on ${road}` : ""}`;
  if (m.type === "roundabout" || m.type === "rotary")
    return `At the roundabout, take ${m.exit ? `exit ${m.exit}` : "the indicated exit"}${onto}`;
  if (direction === "uturn") return `Make a U-turn${onto}`;
  if (m.type === "merge") return `Merge ${direction}${onto}`;
  if (m.type === "off ramp") return `Take the exit ${direction}${onto}`;
  if (m.type === "fork") return `Keep ${direction}${onto}`;
  return direction && direction !== "straight"
    ? `Turn ${direction}${onto}`
    : `Continue${road ? ` on ${road}` : " straight"}`;
}
export function parseRoute(data: any, destination: Destination): DrivingRoute {
  const r = data?.routes?.[0],
    coordinates = r?.geometry?.coordinates;
  if (
    data?.code !== "Ok" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > 100000 ||
    !coordinates.every(validCoordinate) ||
    !Number.isFinite(r.distance) ||
    r.distance < 0 ||
    !Number.isFinite(r.duration) ||
    r.duration < 0
  )
    throw new Error(
      "No usable driving route found. Choose a nearby road or another destination.",
    );
  const cumulative = cumulativeDistances(coordinates),
    length = cumulative.at(-1)!;
  const route: DrivingRoute = {
    coordinates,
    cumulative,
    length,
    distance: r.distance,
    duration: r.duration,
    steps: [],
    destination,
  };
  let last = 0;
  for (const leg of r.legs ?? [])
    for (const s of leg.steps ?? []) {
      if (!validCoordinate(s.maneuver?.location)) continue;
      const at = Math.max(
        last,
        project(route, asFix(s.maneuver.location), last).offset,
      );
      last = at;
      route.steps.push({
        at,
        instruction: maneuverText(s.maneuver, String(s.name ?? "")),
      });
    }
  if (!route.steps.length)
    route.steps = [
      { at: 0, instruction: "Follow the highlighted driving route" },
      { at: length, instruction: "Arrive at your destination" },
    ];
  return route;
}
export function guidance(route: DrivingRoute, fix: Fix, previous = 0) {
  const p = project(route, fix, previous),
    offRoute = p.distance > Math.max(55, fix.accuracy + 30);
  const arrived =
    !offRoute &&
    distance(fix, route.destination) <= 25 &&
    p.offset >= route.length * 0.9;
  const next =
    route.steps.find((s) => s.at > p.offset + 0.5) ?? route.steps.at(-1)!;
  const ratio = route.length ? Math.max(0, 1 - p.offset / route.length) : 0;
  return {
    offset: p.offset,
    offRoute,
    arrived,
    instruction: arrived
      ? "You have arrived"
      : offRoute
        ? "Off route · check your position"
        : next.instruction,
    toTurn: Math.max(0, next.at - p.offset),
    remaining: route.distance * ratio,
    seconds: route.duration * ratio,
  };
}
export const meters = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)} km` : `${Math.round(n / 10) * 10} m`;
export function demoRoute(): DrivingRoute {
  const coordinates: Coordinate[] = [
      [77.5925, 12.9716],
      [77.5946, 12.9716],
      [77.598, 12.9716],
      [77.5997, 12.9716],
    ],
    cumulative = cumulativeDistances(coordinates),
    length = cumulative.at(-1)!;
  return {
    coordinates,
    cumulative,
    length,
    distance: length,
    duration: 60,
    destination: { name: "Demo finish", latitude: 12.9716, longitude: 77.5997 },
    demo: true,
    steps: [
      { at: 0, instruction: "Head east on the simulated route" },
      {
        at: cumulative[1],
        instruction: "Continue through Demo Garden quiet zone",
      },
      {
        at: cumulative[2],
        instruction: "Continue toward Demo Library and marked corner",
      },
      { at: length, instruction: "Arrive at the demo finish" },
    ],
  };
}
