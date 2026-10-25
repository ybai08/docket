import type { DailySet } from '@/data/types';

import { formatDayShort } from './day';
import type { DayProgress } from './game-store';
import { rollCallAgreement } from './scoring';
import type { GameStatus } from './use-today';

/**
 * Spoiler-free share text: scores and squares only, never bills or votes.
 * The colored squares are the only emoji in the app.
 */
export function shareText(
  day: string,
  set: DailySet,
  progress: DayProgress,
  status: Record<'rollCall' | 'filedOrFake' | 'landslide', GameStatus>,
  link?: string,
) {
  const lines = [`Docket ${formatDayShort(day)}`];
  if (status.rollCall.state === 'done') {
    const squares = rollCallAgreement(set.rollCall, progress.rollCall.votes)
      .map((a) => (a ? '🟩' : '🟪'))
      .join('');
    lines.push(`Roll Call ${status.rollCall.result}/${status.rollCall.total} ${squares}`);
  }
  if (status.filedOrFake.state === 'done') {
    lines.push(`Filed or Fake ${status.filedOrFake.result}/${status.filedOrFake.total}`);
  }
  if (status.landslide.state === 'done') lines.push(`Landslide ${status.landslide.result ?? 0} pts`);
  if (link) lines.push(link);
  return lines.join('\n');
}
