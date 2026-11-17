import { scoreCrossings } from "./trip";
import type { Trip } from "./types";
export interface Penalty {
  id: string;
  at: number;
  kind: "repeated-honks" | "missed-corner";
  reason: string;
  eventIds: string[];
}
export interface ProgramRules {
  repeatCount: number;
  repeatWindowMs: number;
}
export const defaultProgramRules: ProgramRules = {
  repeatCount: 2,
  repeatWindowMs: 5000,
};
export function programPenalties(
  trip: Trip,
  rules = defaultProgramRules,
): Penalty[] {
  const penalties: Penalty[] = [];
  const events = trip.events
    .filter((e) => e.label === "Likely your horn")
    .sort((a, b) => a.start - b.start);
  let cluster: typeof events = [];
  const finish = () => {
    for (let i = 0; i + rules.repeatCount <= cluster.length; i++) {
      const group = cluster.slice(i, i + rules.repeatCount);
      if (
        group.at(-1)!.start - group[0].start <= rules.repeatWindowMs &&
        !trip.gaps.some(
          (g) =>
            g.kind === "mic" &&
            g.start < group.at(-1)!.end &&
            (g.end ?? Infinity) > group[0].start,
        )
      ) {
        penalties.push({
          id: "repeat:" + group[0].id,
          at: group.at(-1)!.end,
          kind: "repeated-honks",
          reason: `Two or more separate likely horn detections within 5 seconds; one penalty for this burst.`,
          eventIds: group.map((e) => e.id),
        });
        break;
      }
    }
    cluster = [];
  };
  for (const event of events) {
    if (cluster.length && event.start - cluster.at(-1)!.end < 480) continue;
    if (
      cluster.length &&
      event.start - cluster.at(-1)!.start > rules.repeatWindowMs
    )
      finish();
    cluster.push(event);
  }
  finish();
  for (const crossing of scoreCrossings(trip, true)) {
    const zone = trip.zones.find((z) => z.id === crossing.zoneId);
    if (
      !zone ||
      zone.type === "quiet zone" ||
      !crossing.end ||
      crossing.outcome !== "Point earned"
    )
      continue;
    penalties.push({
      id: "missed:" + crossing.id,
      at: crossing.end,
      kind: "missed-corner",
      reason: `No horn detected during the complete mapped crossing at ${zone.name}.`,
      eventIds: [],
    });
  }
  return penalties;
}
export function dayKey(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
/** Recomputed from saved trips: no duplicate awards on reload, no demo rewards. */
export function programLedger(trips: Trip[], now: number, timeZone: string) {
  const today = dayKey(now, timeZone);
  const days = new Map<
    string,
    { penalties: number; completed: boolean; coverage: boolean }
  >();
  let penalties = 0;
  for (const trip of new Map(trips.map((t) => [t.id, t])).values()) {
    if (trip.mode !== "live" || trip.scoringVersion !== 2) continue;
    const end = trip.endedAt ?? now;
    const keys = new Set([
      dayKey(trip.startedAt, timeZone),
      dayKey(end, timeZone),
    ]);
    // Include dates crossed by an overnight trip, including DST boundaries.
    for (let at = trip.startedAt; at < end; at += 3600000)
      keys.add(dayKey(at, timeZone));
    for (const key of keys) {
      const d = days.get(key) ?? {
        penalties: 0,
        completed: true,
        coverage: true,
      };
      d.completed &&= trip.endedAt !== undefined;
      const monitoringStart = Math.max(
        trip.fixes[0]?.at ?? end,
        ...trip.gaps
          .filter((g) => g.start === trip.startedAt)
          .map((g) => g.end ?? end),
      );
      d.coverage &&=
        monitoringStart < end &&
        !trip.gaps.some(
          (g) => (g.end ?? end) > Math.max(g.start, monitoringStart),
        ) &&
        !trip.crossings.some((c) => c.initialInside || !c.end);
      days.set(key, d);
    }
    for (const p of programPenalties(trip)) {
      penalties++;
      const key = dayKey(p.at, timeZone);
      const d = days.get(key) ?? {
        penalties: 0,
        completed: false,
        coverage: false,
      };
      d.penalties++;
      days.set(key, d);
    }
  }
  const cleanDays = [...days].filter(
    ([key, d]) => key < today && d.completed && d.coverage && d.penalties === 0,
  ).length;
  const points = cleanDays * 5;
  return {
    penalties,
    points,
    rewards: Math.floor(points / 100),
    progress: points % 100,
    cleanDays,
    todayPenalties: days.get(today)?.penalties ?? 0,
  };
}
