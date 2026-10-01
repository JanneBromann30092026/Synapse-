import { describe, expect, it } from 'vitest';
import { countByDay, dayKey, heatmapWeeks, shiftDay, studyStreak, weekdayIndex } from './activity';

const BERLIN = 'Europe/Berlin';

describe('dayKey', () => {
  it('uses the local calendar day around midnight', () => {
    // 23:30 UTC on 30 Sep is already 1 Oct in Berlin (UTC+2).
    expect(dayKey('2026-09-30T21:59:59Z', BERLIN)).toBe('2026-09-30');
    expect(dayKey('2026-09-30T22:00:00Z', BERLIN)).toBe('2026-10-01');
    expect(dayKey('2026-09-30T23:30:00Z', 'UTC')).toBe('2026-09-30');
    expect(dayKey('2026-10-01T03:00:00Z', 'America/New_York')).toBe('2026-09-30');
  });

  it('follows daylight saving time (Berlin: UTC+1 in winter)', () => {
    expect(dayKey('2026-12-31T22:59:59Z', BERLIN)).toBe('2026-12-31');
    expect(dayKey('2026-12-31T23:00:00Z', BERLIN)).toBe('2027-01-01');
  });
});

describe('shiftDay and weekdayIndex', () => {
  it('does calendar arithmetic across months, years and DST changes', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29');
    // DST ends in Europe on 25 Oct 2026 – still exactly one day per step.
    expect(shiftDay('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('starts weeks on Monday', () => {
    expect(weekdayIndex('2026-09-28')).toBe(0); // Monday
    expect(weekdayIndex('2026-10-01')).toBe(3); // Thursday
    expect(weekdayIndex('2026-10-04')).toBe(6); // Sunday
  });
});

describe('countByDay', () => {
  it('groups answers by local day', () => {
    const counts = countByDay(
      ['2026-09-30T21:00:00Z', '2026-09-30T22:30:00Z', '2026-10-01T08:00:00Z'],
      BERLIN,
    );
    expect(Object.fromEntries(counts)).toEqual({ '2026-09-30': 1, '2026-10-01': 2 });
  });
});

describe('studyStreak', () => {
  const days = (...keys: string[]) => new Set(keys);

  it('counts consecutive days ending today', () => {
    expect(studyStreak(days('2026-09-29', '2026-09-30', '2026-10-01'), '2026-10-01')).toBe(3);
  });

  it('stays alive until today is over', () => {
    expect(studyStreak(days('2026-09-29', '2026-09-30'), '2026-10-01')).toBe(2);
  });

  it('breaks after a missed day', () => {
    expect(studyStreak(days('2026-09-28', '2026-09-29'), '2026-10-01')).toBe(0);
    expect(
      studyStreak(days('2026-09-27', '2026-09-29', '2026-09-30', '2026-10-01'), '2026-10-01'),
    ).toBe(3);
    expect(studyStreak(days(), '2026-10-01')).toBe(0);
  });

  it('counts across month ends and DST changes', () => {
    const keys = Array.from({ length: 40 }, (_, i) => shiftDay('2026-11-05', -i));
    expect(studyStreak(days(...keys), '2026-11-05')).toBe(40);
  });

  it('uses local days: a late answer after midnight belongs to the new day', () => {
    // 00:15 Berlin on 1 Oct (22:15 UTC on 30 Sep) plus the evening before.
    const counts = countByDay(['2026-09-29T19:00:00Z', '2026-09-30T22:15:00Z'], BERLIN);
    expect(studyStreak(counts, '2026-10-01')).toBe(1);
    expect(
      studyStreak(
        countByDay(['2026-09-29T19:00:00Z', '2026-09-30T22:15:00Z'], 'UTC'),
        '2026-09-30',
      ),
    ).toBe(2);
  });
});

describe('heatmapWeeks', () => {
  it('builds Monday-first weeks ending with the current week', () => {
    const weeks = heatmapWeeks(new Map(), '2026-10-01', 16);
    expect(weeks).toHaveLength(16);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]?.[0]?.date).toBe('2026-06-15');
    expect(weekdayIndex(weeks[0]?.[0]?.date ?? '')).toBe(0);
    const last = weeks[15] ?? [];
    expect(last[3]).toMatchObject({ date: '2026-10-01', future: false });
    expect(last[4]).toMatchObject({ date: '2026-10-02', future: true });
  });

  it('scales levels to the busiest day and ignores future days', () => {
    const counts = new Map([
      ['2026-09-30', 40],
      ['2026-09-29', 10],
      ['2026-09-28', 1],
      ['2026-10-03', 99],
    ]);
    const cells = heatmapWeeks(counts, '2026-10-01', 2).flat();
    const level = (date: string) => cells.find((c) => c.date === date)?.level;
    expect(level('2026-09-30')).toBe(4);
    expect(level('2026-09-29')).toBe(1);
    expect(level('2026-09-28')).toBe(1);
    expect(level('2026-09-27')).toBe(0);
    expect(cells.find((c) => c.date === '2026-10-03')).toMatchObject({ count: 0, level: 0 });
  });
});
