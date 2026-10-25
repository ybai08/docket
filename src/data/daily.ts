import { BILLS } from './bills';
import { CAPTIONS_OCT24 } from './captions';
import { LANDSLIDE_OCT24 } from './landslide';
import type { DailySet } from './types';

/** Seeded sets by Central-time day. The server loads these with `npm run seed`. */
export const SEEDED_SETS: Record<string, Omit<DailySet, 'day'>> = {
  '2026-10-24': {
    rollCall: ['tx-89r-hb1481', 'us-119-s146', 'tx-89r-sb3', 'us-119-s5', 'atx-c14-2026-0020'].map((id) => BILLS[id]),
    filedOrFake: CAPTIONS_OCT24,
    landslide: {
      prompt: 'Drag to rank by the final House vote, widest margin on top.',
      items: LANDSLIDE_OCT24,
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
