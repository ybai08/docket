import { BILLS } from './bills';
import { CAPTIONS_OCT24 } from './captions';
import { LANDSLIDE_OCT24 } from './landslide';
import type { DailySet } from './types';

const SETS: Omit<DailySet, 'day'>[] = [
  {
    rollCall: ['tx-89r-hb1481', 'us-119-s146', 'tx-89r-sb3', 'us-119-s5', 'atx-c14-2026-0020'].map((id) => BILLS[id]),
    filedOrFake: CAPTIONS_OCT24,
    landslide: {
      prompt: 'Drag to rank by the final House vote, widest margin on top.',
      items: LANDSLIDE_OCT24,
    },
  },
];

const FIRST_DAY = '2026-10-24';

/**
 * The set for a Central-time day. Until the server schedules more, every day reuses
 * the seeded sets in rotation so the app always has ballots.
 */
export function dailySetFor(day: string): DailySet {
  const offset = Math.max(0, Math.round((Date.parse(day) - Date.parse(FIRST_DAY)) / 86400000));
  return { day, ...SETS[offset % SETS.length] };
}
