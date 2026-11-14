import { scoreCrossings } from "./trip";
import type { Trip } from "./types";

export interface RepeatPattern {
  zoneId: string;
  start: number;
  end: number;
  eventIds: string[];
  adjustment: number;
  reason: string;
}
/** Transparent context rule, not an AI judgment of necessity. One deduction per crossing. */
export function scoreTrip(trip: Trip) {
  const crossings = scoreCrossings(trip);
  const repeats: RepeatPattern[] = [];
  const used = new Set<string>();
  for (const c of crossings) {
    if (c.outcome === "Unscored" || !c.end) continue;
    const events = trip.events
      .filter(
        (e) =>
          e.label === "Likely your horn" &&
          e.location &&
          e.zoneIds.includes(c.zoneId) &&
          e.start >= c.start &&
          e.end <= c.end! &&
          !used.has(e.id),
      )
      .sort((a, b) => a.start - b.start);
    for (let i = 0; i + 2 < events.length; i++) {
      const group = events.slice(i, i + 3);
      if (group[2].end - group[0].start > 10000) continue;
      if (
        group[1].start - group[0].end < 480 ||
        group[2].start - group[1].end < 480
      )
        continue;
      const eventIds = group.map((e) => e.id);
      eventIds.forEach((id) => used.add(id));
      repeats.push({
        zoneId: c.zoneId,
        start: group[0].start,
        end: group[2].end,
        eventIds,
        adjustment: trip.repeatPenalty ? -1 : 0,
        reason:
          "Review: three separate likely matches within 10 seconds in one complete quiet-zone crossing. This pattern does not establish whether honking was necessary.",
      });
      break;
    }
  }
  const quietPoints = crossings.filter(
    (c) => c.outcome === "Point earned",
  ).length;
  const deductions = repeats.reduce((sum, r) => sum - r.adjustment, 0);
  return {
    crossings,
    repeats,
    quietPoints,
    deductions,
    totalPoints: quietPoints - deductions,
  };
}
