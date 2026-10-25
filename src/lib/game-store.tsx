import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Vote } from '@/data/types';

import { useAuth } from './auth-context';

export type RollCallProgress = {
  votes: Record<string, Vote>;
  /** Results seen: the ballot is final and Today reopens the results. */
  revealed?: boolean;
};

export type FiledOrFakeProgress = {
  /** caption id -> the player's guess (true = "Filed"). */
  answers: Record<string, boolean>;
  done?: boolean;
  score?: number;
};

export type LandslideProgress = {
  order?: string[];
  score?: number;
  done?: boolean;
};

export type DayProgress = {
  rollCall: RollCallProgress;
  filedOrFake: FiledOrFakeProgress;
  landslide: LandslideProgress;
  /** Roll Call agreement with the final vote, stored when results are revealed. */
  rollCallAgreed?: number;
};

type Stored = Record<string, DayProgress>;

const empty = (): DayProgress => ({ rollCall: { votes: {} }, filedOrFake: { answers: {} }, landslide: {} });

type Store = {
  ready: boolean;
  days: Stored;
  get: (day: string) => DayProgress;
  update: (day: string, fn: (p: DayProgress) => DayProgress) => void;
  /** Overwrite a day with the server's copy. */
  replace: (day: string, progress: DayProgress) => void;
};

const GameStoreContext = createContext<Store | null>(null);

export function GameStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const key = `docket:progress:${user?.uid ?? 'guest'}`;
  // Progress belongs to the account it was loaded for; `ready` flips when this user's data is in.
  const [loaded, setLoaded] = useState<{ key: string; days: Stored } | null>(null);
  const ready = loaded?.key === key;
  const days = useMemo(() => (ready ? loaded.days : {}), [ready, loaded]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then((raw) => (raw ? (JSON.parse(raw) as Stored) : {}))
      .catch(() => ({}))
      .then((stored) => {
        if (!cancelled) setLoaded({ key, days: stored });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(loaded.key, JSON.stringify(loaded.days)).catch(() => {});
  }, [loaded]);

  const get = useCallback((day: string) => days[day] ?? empty(), [days]);
  const update = useCallback((day: string, fn: (p: DayProgress) => DayProgress) => {
    setLoaded((prev) => (prev ? { ...prev, days: { ...prev.days, [day]: fn(prev.days[day] ?? empty()) } } : prev));
  }, []);

  const replace = useCallback((day: string, progress: DayProgress) => update(day, () => progress), [update]);

  const value = useMemo(() => ({ ready, days, get, update, replace }), [ready, days, get, update, replace]);
  return <GameStoreContext.Provider value={value}>{children}</GameStoreContext.Provider>;
}

export function useGameStore() {
  const ctx = useContext(GameStoreContext);
  if (!ctx) throw new Error('useGameStore must be used inside GameStoreProvider');
  return ctx;
}
