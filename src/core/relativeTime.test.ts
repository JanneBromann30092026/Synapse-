import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const now = new Date(2026, 8, 30, 14, 0, 0); // 30.09.2026, 14:00 local time
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('says "jetzt" for the last few seconds', () => {
    expect(formatRelativeTime(ago(10 * 1000), now)).toBe('jetzt');
  });

  it('uses minutes and hours on the same day', () => {
    expect(formatRelativeTime(ago(5 * MIN), now)).toBe('vor 5 Minuten');
    expect(formatRelativeTime(ago(1 * MIN), now)).toBe('vor 1 Minute');
    expect(formatRelativeTime(ago(3 * HOUR), now)).toBe('vor 3 Stunden');
  });

  it('counts calendar days', () => {
    // 23:00 the day before is "gestern", even though it is only 15 hours ago.
    expect(formatRelativeTime(new Date(2026, 8, 29, 23, 0).toISOString(), now)).toBe('gestern');
    expect(formatRelativeTime(new Date(2026, 8, 28, 9, 0).toISOString(), now)).toBe('vorgestern');
    expect(formatRelativeTime(ago(4 * DAY), now)).toBe('vor 4 Tagen');
  });

  it('uses weeks, months and years for older dates', () => {
    expect(formatRelativeTime(ago(10 * DAY), now)).toBe('letzte Woche');
    expect(formatRelativeTime(ago(21 * DAY), now)).toBe('vor 3 Wochen');
    expect(formatRelativeTime(ago(65 * DAY), now)).toBe('vor 2 Monaten');
    expect(formatRelativeTime(ago(400 * DAY), now)).toBe('letztes Jahr');
  });

  it('returns an empty string for invalid dates', () => {
    expect(formatRelativeTime('not a date', now)).toBe('');
  });
});
