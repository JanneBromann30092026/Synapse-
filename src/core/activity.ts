/**
 * Study activity per calendar day in the local time zone: day keys, the streak and the
 * heatmap grid. Day keys are "YYYY-MM-DD"; arithmetic on them is pure calendar arithmetic,
 * so daylight saving changes never skip or double a day.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? '';
  let format = formatters.get(key);
  if (!format) {
    // en-CA formats as YYYY-MM-DD.
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(key, format);
  }
  return format;
}

/** Calendar day ("YYYY-MM-DD") of an instant in `timeZone` (default: the device's zone). */
export function dayKey(instant: string | number | Date, timeZone?: string): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  return formatter(timeZone).format(date);
}

function parseKey(key: string): Date {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The day `days` after (negative: before) `key`. */
export function shiftDay(key: string, days: number): string {
  const date = parseKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key: string): number {
  return (parseKey(key).getUTCDay() + 6) % 7;
}

/** Number of answers per local day. */
export function countByDay(timestamps: Iterable<string>, timeZone?: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const timestamp of timestamps) {
    const key = dayKey(timestamp, timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Days in a row with at least one answer, ending today. A streak stays alive until today is
 * over: without an answer yet today it counts up to yesterday.
 */
export function studyStreak(
  activeDays: ReadonlySet<string> | ReadonlyMap<string, number>,
  today: string,
): number {
  const has = (key: string) => activeDays.has(key);
  let day = has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (has(day)) {
    streak += 1;
    day = shiftDay(day, -1);
  }
  return streak;
}

export interface HeatmapCell {
  date: string;
  count: number;
  /** 0 (none) … 4 (most); relative to the busiest day shown. */
  level: 0 | 1 | 2 | 3 | 4;
  /** After today (the rest of the current week). */
  future: boolean;
}

/**
 * Columns of weeks (Monday first, oldest week first) ending with the week of `today`.
 * Each column has 7 cells.
 */
export function heatmapWeeks(
  counts: ReadonlyMap<string, number>,
  today: string,
  weeks = 16,
): HeatmapCell[][] {
  const firstMonday = shiftDay(today, -weekdayIndex(today) - (weeks - 1) * 7);
  let max = 0;
  const columns: HeatmapCell[][] = [];
  for (let week = 0; week < weeks; week += 1) {
    const column: HeatmapCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = shiftDay(firstMonday, week * 7 + weekday);
      const future = date > today;
      const count = future ? 0 : (counts.get(date) ?? 0);
      max = Math.max(max, count);
      column.push({ date, count, level: 0, future });
    }
    columns.push(column);
  }
  for (const column of columns) {
    for (const cell of column) {
      cell.level =
        cell.count === 0 ? 0 : (Math.min(4, Math.ceil((cell.count / max) * 4)) as 1 | 2 | 3 | 4);
    }
  }
  return columns;
}
