import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it('formats bytes without decimals', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('uses decimal units and a German decimal comma', () => {
    expect(formatBytes(1000)).toBe('1 KB');
    expect(formatBytes(1500)).toBe('1,5 KB');
    expect(formatBytes(2_340_000)).toBe('2,3 MB');
    expect(formatBytes(1_000_000_000)).toBe('1 GB');
  });

  it('drops decimals for values of 100 and above', () => {
    expect(formatBytes(123_456_789)).toBe('123 MB');
  });

  it('caps at the largest unit', () => {
    expect(formatBytes(5e15)).toBe('5.000 TB');
  });

  it('returns a dash for invalid input', () => {
    expect(formatBytes(-1)).toBe('–');
    expect(formatBytes(Number.NaN)).toBe('–');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('–');
  });
});
