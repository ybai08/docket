import { useEffect, useState } from 'react';

import { dailySetFor } from '@/data/daily';

import { centralDay, msUntilNextDay } from './day';
import { useGameStore } from './game-store';
import { filedOrFakeScore, rollCallAgreement } from './scoring';

export type GameStatus = { state: 'new' | 'progress' | 'done'; done: number; total: number; result?: number };

/** Re-renders at Central midnight so new ballots appear without a restart. */
export function useCentralDay() {
  const [day, setDay] = useState(() => centralDay());
  useEffect(() => {
    const t = setTimeout(() => setDay(centralDay()), msUntilNextDay() + 1000);
    return () => clearTimeout(t);
  }, [day]);
  return day;
}

export function useToday() {
  const day = useCentralDay();
  const store = useGameStore();
  const set = dailySetFor(day);
  const progress = store.get(day);

  const votes = Object.keys(progress.rollCall.votes).length;
  const agreedCount = rollCallAgreement(set.rollCall, progress.rollCall.votes).filter(Boolean).length;
  const answered = Object.keys(progress.filedOrFake.answers).length;

  const status = {
    rollCall: {
      state: progress.rollCall.revealed ? 'done' : votes > 0 ? 'progress' : 'new',
      done: votes,
      total: set.rollCall.length,
      result: agreedCount,
    },
    filedOrFake: {
      state: progress.filedOrFake.done ? 'done' : answered > 0 ? 'progress' : 'new',
      done: answered,
      total: set.filedOrFake.length,
      result: filedOrFakeScore(set.filedOrFake, progress.filedOrFake.answers),
    },
    landslide: {
      state: progress.landslide.done ? 'done' : 'new',
      done: progress.landslide.done ? 1 : 0,
      total: 1,
      result: progress.landslide.score,
    },
  } satisfies Record<string, GameStatus>;

  const cast = Object.values(status).filter((s) => s.state === 'done').length;
  return { ready: store.ready, day, set, progress, status, cast, update: store.update };
}
