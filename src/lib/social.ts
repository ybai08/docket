import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { api } from './api';

export type DailyAgreement = { played: false } | { played: true; total: number; agreed: number | null };

export type Friend = {
  id: string;
  name: string;
  isDemo: boolean;
  agreementPct: number | null;
  sharedBills: number;
  votesShared: boolean;
  today: DailyAgreement;
};

export type BoardRow = {
  id: string;
  name: string;
  isYou: boolean;
  isDemo: boolean;
  points: number;
  games: number;
  streak: number;
  playedToday: boolean;
};

export type Leaderboard = {
  day: string;
  board: BoardRow[];
  beyond: { label: string; points: number | null }[];
};

export type FriendsData = {
  friends: Friend[];
  requests: { id: string; from: { id: string; name: string }; source: string }[];
  leaderboard: Leaderboard;
};

export type FriendDetail = {
  id: string;
  name: string;
  isDemo: boolean;
  agreement: { pct: number | null; agreed: number | null; shared: number; minShared: number };
  topics: { topic: string; pct: number; shared: number }[];
  votesShared: boolean;
  myOverride: boolean | null;
  recent: { number: string; title: string; mine: 'yea' | 'nay'; theirs: 'yea' | 'nay' }[];
};

/** Loads a server resource whenever the screen gains focus. */
export function useRemote<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { data, error, loading, reload: load, setData };
}

const SOURCE_LABELS: Record<string, string> = {
  username: 'Added you by username',
  contacts: 'From your contacts',
  group: 'From a shared group',
  qr: 'Scanned your QR code',
  demo: 'Demo account',
};

export function requestSource(source: string) {
  return SOURCE_LABELS[source] ?? 'Wants to be friends';
}
