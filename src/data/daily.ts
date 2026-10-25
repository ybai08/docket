import { BILLS } from './bills';
import { CAPTIONS_OCT24, CAPTIONS_OCT25 } from './captions';
import { LANDSLIDE_OCT24, LANDSLIDE_OCT25 } from './landslide';
import type { DailySet } from './types';

/** Seeded sets by Central-time day. The server loads these with `npm run seed`. */
export const SEEDED_SETS: Record<string, Omit<DailySet, 'day'>> = {
  // History only, so test and demo accounts share enough bills for agreement to show.
  '2026-10-23': {
    rollCall: ['tx-89r-hb2', 'tx-89r-sb2', 'tx-89r-sb984', 'tx-89r-sb1498', 'atx-26-2274'].map((id) => BILLS[id]),
    filedOrFake: [],
    landslide: { prompt: '', items: [] },
  },
  '2026-10-24': {
    rollCall: ['tx-89r-hb1481', 'us-119-s146', 'tx-89r-sb3', 'us-119-s5', 'atx-c14-2026-0020'].map((id) => BILLS[id]),
    filedOrFake: CAPTIONS_OCT24,
    landslide: {
      prompt: 'Drag to rank by the final House vote, widest margin on top.',
      items: LANDSLIDE_OCT24,
    },
  },
  '2026-10-25': {
    rollCall: ['tx-89r-sb6', 'us-119-s331', 'tx-892-hb4', 'us-119-hr1', 'atx-26-2163'].map((id) => BILLS[id]),
    filedOrFake: CAPTIONS_OCT25,
    landslide: {
      prompt: 'Drag to rank by the final House vote, widest margin on top.',
      items: LANDSLIDE_OCT25,
    },
  },
};

/**
 * Offline fallback for a Central-time day: that day's set, else the latest seeded one
 * before it (keeping that set's own day so votes are never recorded twice).
 */
export function dailySetFor(day: string): DailySet {
  const days = Object.keys(SEEDED_SETS).sort();
  const pick = [...days].reverse().find((d) => d <= day) ?? days[0];
  return { day: pick, ...SEEDED_SETS[pick] };
}
