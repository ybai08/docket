import type { Bill, Caption, LandslideItem, Vote } from '@/data/types';

import { addDays } from './day';
import type { DayProgress } from './game-store';

/** Agreeing with the final vote means your vote matches whether the body passed it. */
export function agreed(bill: Bill, vote: Vote) {
  return (vote === 'yea') === bill.passed;
}

export function rollCallAgreement(bills: Bill[], votes: Record<string, Vote>) {
  return bills.map((b) => (votes[b.id] ? agreed(b, votes[b.id]) : null));
}

export function filedOrFakeScore(captions: Caption[], answers: Record<string, boolean>) {
  return captions.filter((c) => answers[c.id] === c.real).length;
}

export function margin(item: Pick<LandslideItem, 'yeas' | 'nays'>) {
  return item.yeas - item.nays;
}

/** The correct order: widest margin first. */
export function landslideAnswer(items: LandslideItem[]) {
  return [...items].sort((a, b) => margin(b) - margin(a)).map((i) => i.billId);
}

/** 3 points for an exact spot, 1 for one off. */
export function landslidePoints(order: string[], answer: string[]) {
  return order.map((id, i): number => {
    const d = Math.abs(answer.indexOf(id) - i);
    return d === 0 ? 3 : d === 1 ? 1 : 0;
  });
}

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
