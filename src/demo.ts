import type { Fix, Frame } from "./types";

/** 60 second west-to-east route; approximately t=12..26 Garden, t=41..54 Library. */
export function demoFix(elapsed: number, startedAt: number): Fix {
  return {
    at: startedAt + elapsed,
    latitude: 12.9716,
    longitude: 77.5925 + 0.0072 * Math.min(elapsed / 60000, 1),
    accuracy: 5,
  };
}
export function demoStage(elapsed: number) {
  if (elapsed < 12000)
    return "Approaching Garden. Keep quiet for the first crossing.";
  if (elapsed < 27000) return "Garden quiet zone · stay quiet to earn a point.";
  if (elapsed < 43000)
    return "First crossing complete. Approaching the Library.";
  if (elapsed < 53000)
    return "Library + marked corner · play your calibrated horn now.";
  return "Route complete. End trip to see your report.";
}
export function scriptedFrame(
  at: number,
  elapsed: number,
  repeats = false,
): Frame {
  const sounding = repeats
    ? [44000, 46000, 48000].some(
        (start) => elapsed >= start && elapsed <= start + 600,
      )
    : elapsed >= 44000 && elapsed <= 46000;
  return { at, rms: sounding ? 0.15 : 0.001, spectrum: [1, 0, 0, 0] };
}
export function validateZones(input: unknown) {
  if (!Array.isArray(input) || input.length > 100)
    throw new Error("Zone file must be an array of at most 100 zones.");
  const ids = new Set<string>();
  for (const z of input) {
    if (
      !z ||
      typeof z.id !== "string" ||
      !z.id ||
      ids.has(z.id) ||
      typeof z.name !== "string" ||
      !z.name ||
      !["quiet zone", "marked corner"].includes(z.type) ||
      !Number.isFinite(z.latitude) ||
      Math.abs(z.latitude) > 90 ||
      !Number.isFinite(z.longitude) ||
      Math.abs(z.longitude) > 180 ||
      !Number.isFinite(z.radius) ||
      z.radius < 20 ||
      z.radius > 5000
    )
      throw new Error(
        "Each zone needs a unique ID, name, valid latitude/longitude, radius (20–5000 m), and type “quiet zone” or “marked corner”.",
      );
    ids.add(z.id);
  }
  return input;
}
