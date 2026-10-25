import { addDays } from './day';
import type { DayProgress } from './game-store';

export * from './rules';

function playedDay(p: DayProgress | undefined) {
  return !!p && (!!p.rollCall.revealed || !!p.filedOrFake.done || !!p.landslide.done);
}

/** Streaks count days with at least one finished ballot. Today not played yet doesn't break it. */
export function streaks(days: Record<string, DayProgress>, today: string) {
  const played = Object.keys(days).filter((d) => playedDay(days[d])).sort();
  let max = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of played) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    max = Math.max(max, run);
    prev = d;
  }
  let current = 0;
  let cursor = playedDay(days[today]) ? today : addDays(today, -1);
  while (playedDay(days[cursor])) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { played: played.length, current, max };
}

export function rollCallStats(days: Record<string, DayProgress>, today: string) {
  const s = streaks(days, today);
  let agreedCount = 0;
  let voted = 0;
  let rollCallsPlayed = 0;
  for (const p of Object.values(days)) {
    if (!p.rollCall.revealed || p.rollCallAgreed === undefined) continue;
    rollCallsPlayed += 1;
    agreedCount += p.rollCallAgreed;
    voted += Object.keys(p.rollCall.votes).length;
  }
  return {
    played: rollCallsPlayed,
    agreementPct: voted ? Math.round((agreedCount / voted) * 100) : 0,
    currentStreak: s.current,
    maxStreak: s.max,
  };
}
