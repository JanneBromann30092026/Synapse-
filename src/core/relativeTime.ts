const UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: 'year', seconds: 365 * 24 * 3600 },
  { unit: 'month', seconds: 30 * 24 * 3600 },
  { unit: 'week', seconds: 7 * 24 * 3600 },
  { unit: 'day', seconds: 24 * 3600 },
  { unit: 'hour', seconds: 3600 },
  { unit: 'minute', seconds: 60 },
];

const formatter = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

/**
 * Relative German time like "vor 5 Minuten", "gestern", "vor 3 Wochen".
 * Days are counted in calendar days (local time), so "gestern" means the previous date.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffSeconds = (date.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diffSeconds);

  if (abs < 45) return formatter.format(0, 'second');
  if (abs < 3600) return formatter.format(Math.round(diffSeconds / 60), 'minute');

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / (24 * 3600 * 1000));
  if (dayDiff === 0) return formatter.format(Math.round(diffSeconds / 3600), 'hour');
  if (Math.abs(dayDiff) < 7) return formatter.format(dayDiff, 'day');

  for (const { unit, seconds } of UNITS) {
    if (abs >= seconds) return formatter.format(Math.round(diffSeconds / seconds), unit);
  }
  return formatter.format(0, 'second');
}
