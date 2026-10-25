// Docket days run on Central time: new ballots arrive at midnight in Austin.
const TZ = 'America/Chicago';

function centralParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') };
}

/** Today's date in Central time as YYYY-MM-DD. */
export function centralDay(now = new Date()) {
  const { y, m, d } = centralParts(now);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(day: string, n: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

export function msUntilNextDay(now = new Date()) {
  const { h, min, s } = centralParts(now);
  return (86400 - (h * 3600 + min * 60 + s)) * 1000 - now.getMilliseconds();
}

export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

function dayDate(day: string) {
  return new Date(`${day}T12:00:00Z`);
}

/** "Saturday, October 24" */
export function formatDayLong(day: string) {
  return dayDate(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** "Oct 24" */
export function formatDayShort(day: string) {
  return dayDate(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
