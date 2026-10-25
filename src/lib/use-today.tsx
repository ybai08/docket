import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { dailySetFor } from '@/data/daily';
import type { DailySet, Vote } from '@/data/types';

import { api } from './api';
import { useAuth } from './auth-context';
import { centralDay, msUntilNextDay } from './day';
import { useGameStore, type DayProgress } from './game-store';
import { useMe } from './me-context';
import { filedOrFakeScore, landslideAnswer, landslidePoints, rollCallAgreement, rollCallStats } from './scoring';

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

type Remote = { set: DailySet; forDay: string };

function useTodayState() {
  const today = useCentralDay();
  const { user } = useAuth();
  const store = useGameStore();
  const [remote, setRemote] = useState<Remote | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const me = useMe();
  // Writes go out in order so the server sees every vote before the Roll Call is finished.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const { ready: storeReady, replace } = store;

  const { refresh: loadStats } = me;

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const res = await api<DailySet & { progress: DayProgress }>('/today');
      const { progress, ...set } = res;
      replace(set.day, progress);
      setRemote({ set, forDay: today });
      setError(null);
      setLoadState('ready');
      loadStats();
    } catch (err) {
      setError((err as Error).message);
      setLoadState('error');
    }
  }, [today, replace, loadStats]);

  useEffect(() => {
    if (!user || !storeReady) return;
    // Defer so the loading state isn't set synchronously inside the effect.
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [user, storeReady, load]);

  // Server set when we have one for today; the bundled seed otherwise (offline or before load).
  const set = remote && remote.forDay === today ? remote.set : dailySetFor(today);
  const day = set.day;
  const progress = store.get(day);

  const send = useCallback(
    (path: string, body: unknown, after?: () => void) => {
      queue.current = queue.current
        .then(() => api(path, { method: 'POST', body }))
        .then(() => {
          setError(null);
          after?.();
        })
        .catch((err: Error) => setError(err.message));
    },
    [],
  );

  const actions = useMemo(
    () => ({
      vote(billId: string, vote: Vote) {
        store.update(day, (p) => ({ ...p, rollCall: { ...p.rollCall, votes: { ...p.rollCall.votes, [billId]: vote } } }));
        send('/votes', { day, billId, vote });
      },
      resetVotes() {
        store.update(day, (p) => ({ ...p, rollCall: { votes: {} } }));
        send('/votes/reset', { day });
      },
      revealRollCall() {
        const agreedCount = rollCallAgreement(set.rollCall, progress.rollCall.votes).filter(Boolean).length;
        store.update(day, (p) => ({ ...p, rollCall: { ...p.rollCall, revealed: true }, rollCallAgreed: agreedCount }));
        send('/results/roll-call', { day }, loadStats);
      },
      answerCaption(captionId: string, filed: boolean) {
        const answers = { ...progress.filedOrFake.answers, [captionId]: filed };
        store.update(day, (p) => ({ ...p, filedOrFake: { ...p.filedOrFake, answers } }));
        send('/results/filed-or-fake', { day, answers, done: false });
      },
      finishFiledOrFake() {
        const answers = progress.filedOrFake.answers;
        const score = filedOrFakeScore(set.filedOrFake, answers);
        store.update(day, (p) => ({ ...p, filedOrFake: { ...p.filedOrFake, done: true, score } }));
        send('/results/filed-or-fake', { day, answers, done: true }, loadStats);
      },
      lockLandslide(order: string[]) {
        const score = landslidePoints(order, landslideAnswer(set.landslide.items)).reduce((a, b) => a + b, 0);
        store.update(day, (p) => ({ ...p, landslide: { order, score, done: true } }));
        send('/results/landslide', { day, order }, loadStats);
      },
    }),
    [day, set, progress, store, send, loadStats],
  );

  const votes = Object.keys(progress.rollCall.votes).length;
  const answered = Object.keys(progress.filedOrFake.answers).length;
  const status = {
    rollCall: {
      state: progress.rollCall.revealed ? 'done' : votes > 0 ? 'progress' : 'new',
      done: votes,
      total: set.rollCall.length,
      result: rollCallAgreement(set.rollCall, progress.rollCall.votes).filter(Boolean).length,
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

  // Server stats when online; computed from this phone's history otherwise.
  const local = rollCallStats(store.days, today);
  const stats = me.stats ?? {
    rollCallsPlayed: local.played,
    agreementPct: local.agreementPct,
    currentStreak: local.currentStreak,
    maxStreak: local.maxStreak,
  };

  return {
    ready: storeReady,
    loadState,
    error,
    reload: load,
    day,
    set,
    progress,
    status,
    cast: Object.values(status).filter((s) => s.state === 'done').length,
    stats,
    actions,
  };
}

type Today = ReturnType<typeof useTodayState>;
const TodayContext = createContext<Today | null>(null);

export function TodayProvider({ children }: { children: ReactNode }) {
  const value = useTodayState();
  return <TodayContext.Provider value={value}>{children}</TodayContext.Provider>;
}

export function useToday() {
  const ctx = useContext(TodayContext);
  if (!ctx) throw new Error('useToday must be used inside TodayProvider');
  return ctx;
}
