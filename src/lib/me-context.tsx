import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from './api';
import { useAuth } from './auth-context';

export type Profile = {
  id: string;
  username: string | null;
  displayName: string | null;
  zip: string | null;
  state: string | null;
  county: string | null;
  city: string | null;
  districts: { congress: string | null; stateSenate: string | null; stateHouse: string | null; schoolDistrict: string | null } | null;
  issues: string[];
  shareVotes: boolean;
  allowUsername: boolean;
  matchContacts: boolean;
  onboarded: boolean;
  dailyReminder: boolean;
  notifyFriendPasses: boolean;
  notifyStreakRisk: boolean;
  notifyWeeklyRecap: boolean;
  notifyRequests: boolean;
  notifyOppositeVote: boolean;
  createdAt: string;
};

export type Stats = {
  daysPlayed: number;
  rollCallsPlayed: number;
  billsVoted: number;
  agreementPct: number;
  currentStreak: number;
  maxStreak: number;
  byGame: { rollCallAgreementPct: number | null; filedOrFakePct: number | null; landslideAvg: number | null };
  issues: { topic: string; votes: number; yeaPct: number }[];
  weekPlayed: string[];
};

export type Location = {
  zip: string;
  state: string;
  stateName: string;
  county: string | null;
  city: string | null;
  districts: NonNullable<Profile['districts']>;
};

type Me = {
  profile: Profile | null;
  stats: Stats | null;
  /** 'error' means the API is unreachable; the app then skips onboarding and plays offline. */
  state: 'loading' | 'ready' | 'error';
  refresh: () => Promise<void>;
  patch: (changes: Partial<Profile>) => Promise<void>;
  saveLocation: (zip: string) => Promise<void>;
};

const MeContext = createContext<Me | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<Me['state']>('loading');

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ profile: Profile; stats: Stats }>('/me');
      setProfile(res.profile);
      setStats(res.stats);
      setState('ready');
    } catch {
      setState((s) => (s === 'ready' ? s : 'error'));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [user, refresh]);

  const patch = useCallback(async (changes: Partial<Profile>) => {
    setProfile((p) => (p ? { ...p, ...changes } : p));
    const res = await api<{ profile: Profile }>('/me', { method: 'PATCH', body: changes });
    setProfile(res.profile);
  }, []);

  const saveLocation = useCallback(async (zip: string) => {
    const res = await api<{ profile: Profile }>('/me/location', { method: 'POST', body: { zip } });
    setProfile(res.profile);
  }, []);

  return (
    <MeContext.Provider value={{ profile: user ? profile : null, stats, state, refresh, patch, saveLocation }}>
      {children}
    </MeContext.Provider>
  );
}

export function useMe() {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error('useMe must be used inside MeProvider');
  return ctx;
}
