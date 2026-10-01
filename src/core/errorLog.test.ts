import { describe, expect, it } from 'vitest';
import {
  describeLogValue,
  formatLogReport,
  LOG_DETAIL_MAX,
  LOG_MESSAGE_MAX,
  redactLogText,
} from './errorLog';

describe('redactLogText', () => {
  it('removes API keys and auth headers', () => {
    const text = redactLogText('failed with sk-ant-api03-ABCdef_123-xyz and x-api-key: secret123');
    expect(text).not.toContain('ABCdef');
    expect(text).not.toContain('secret123');
    expect(text).toContain('sk-ant-[entfernt]');
  });

  it('shortens long quoted texts and the whole message', () => {
    const card = 'Die Grenzneigung zum Konsum gibt an, wie stark der Konsum steigt';
    const text = redactLogText(`Duplicate front "${card}"`);
    expect(text).not.toContain('wie stark');
    expect(redactLogText('x'.repeat(1000)).length).toBe(LOG_MESSAGE_MAX);
  });

  it('collapses whitespace', () => {
    expect(redactLogText('a \n\n  b')).toBe('a b');
  });
});

describe('describeLogValue', () => {
  it('uses the error name, message and stack', () => {
    const error = new TypeError('boom');
    const result = describeLogValue(['Save failed', error]);
    expect(result.message).toBe('Save failed TypeError: boom');
    expect(result.detail?.length).toBeLessThanOrEqual(LOG_DETAIL_MAX);
  });

  it('never logs object contents', () => {
    const result = describeLogValue(['Card', { front: 'geheim', back: 'antwort' }, [1, 2]]);
    expect(result.message).toBe('Card [Objekt] [Array]');
  });

  it('falls back for empty input', () => {
    expect(describeLogValue([undefined]).message).toBe('Unbekannter Fehler');
  });
});

describe('formatLogReport', () => {
  const meta = {
    version: '1.0.0',
    buildTime: '2026-10-01T10:00:00Z',
    userAgent: 'iPad',
    standalone: true,
    now: '2026-10-01T12:00:00Z',
  };

  it('lists entries newest first with header', () => {
    const report = formatLogReport(
      [
        { at: '2026-10-01T10:00:00Z', level: 'error', source: 'window', message: 'old' },
        {
          at: '2026-10-01T11:00:00Z',
          level: 'warn',
          source: 'console',
          message: 'new',
          detail: 'Error: x at a.js:1 at b.js:2',
        },
      ],
      meta,
    );
    expect(report).toContain('Version: 1.0.0');
    expect(report).toContain('Homescreen-App: ja');
    expect(report.indexOf('new')).toBeLessThan(report.indexOf('old'));
    expect(report).toContain('    at a.js:1');
  });

  it('says when the log is empty', () => {
    expect(formatLogReport([], meta)).toContain('(keine Einträge)');
  });
});
