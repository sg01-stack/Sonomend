import { usable } from "./trip";
import type { Trip } from "./types";
export function routeSvg(trip: Trip): string {
  const fixes = trip.fixes.filter(usable);
  if (fixes.length < 2)
    return '<p class="muted">A route appears after two usable GPS fixes.</p>';
  const minX = Math.min(...fixes.map((f) => f.longitude)),
    maxX = Math.max(...fixes.map((f) => f.longitude));
  const minY = Math.min(...fixes.map((f) => f.latitude)),
    maxY = Math.max(...fixes.map((f) => f.latitude));
  const midLat = (((maxY + minY) / 2) * Math.PI) / 180,
    lonScale = Math.cos(midLat);
  const spanX = (maxX - minX) * lonScale,
    spanY = maxY - minY,
    scale = Math.min(
      500 / Math.max(spanX, 0.00001),
      140 / Math.max(spanY, 0.00001),
    );
  const p = (lon: number, lat: number) => [
    300 + (lon - (minX + maxX) / 2) * lonScale * scale,
    100 - (lat - (minY + maxY) / 2) * scale,
  ];
  const segments: string[] = [];
  let segment: string[] = [];
  for (const f of fixes) {
    const prev = fixes[fixes.indexOf(f) - 1];
    const interrupted =
      prev &&
      (f.at - prev.at > 5000 ||
        trip.gaps.some(
          (g) =>
            g.kind === "gps" && g.start < f.at && (g.end ?? Infinity) > prev.at,
        ));
    if (interrupted && segment.length) {
      segments.push(segment.join(" "));
      segment = [];
    }
    segment.push(p(f.longitude, f.latitude).join(","));
  }
  if (segment.length) segments.push(segment.join(" "));
  const start = p(fixes[0].longitude, fixes[0].latitude),
    end = p(fixes.at(-1)!.longitude, fixes.at(-1)!.latitude);
  return `<svg viewBox="0 0 600 200" class="route" role="img" aria-label="Local route sketch with detection markers; not a navigation map"><defs><pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="currentColor" opacity=".06"/></pattern></defs><rect width="600" height="200" fill="url(#grid)"/>${segments.map((s) => `<polyline points="${s}" fill="none" stroke="#45907b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}<circle cx="${start[0]}" cy="${start[1]}" r="7" fill="#122e2b"/><circle cx="${end[0]}" cy="${end[1]}" r="7" fill="#b7df83" stroke="#122e2b" stroke-width="2"/>${trip.events
    .filter((e) => e.location)
    .map((e) => {
      const point = p(e.location!.longitude, e.location!.latitude);
      return `<circle cx="${point[0]}" cy="${point[1]}" r="8" fill="${e.review ? "#d86c42" : "#d9a634"}" stroke="white" stroke-width="2"/>`;
    })
    .join("")}</svg>`;
}
