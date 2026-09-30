import { describe, expect, it } from 'vitest';
import { allowedInTextField, matchesHotkey, parseHotkey, type KeyEventLike } from './hotkeys';

const key = (overrides: Partial<KeyEventLike>): KeyEventLike => ({
  key: 'k',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe('hotkeys', () => {
  it('maps mod to Cmd on Apple devices and Ctrl elsewhere', () => {
    expect(parseHotkey('mod+k', true)).toMatchObject({ key: 'k', meta: true, ctrl: false });
    expect(parseHotkey('Mod+K', false)).toMatchObject({ key: 'k', meta: false, ctrl: true });
  });

  it('resolves key aliases', () => {
    expect(parseHotkey('esc', true).key).toBe('escape');
    expect(parseHotkey('shift+return', true)).toMatchObject({ key: 'enter', shift: true });
  });

  it('matches only the exact modifier combination', () => {
    const cmdK = parseHotkey('mod+k', true);
    expect(matchesHotkey(key({ metaKey: true }), cmdK)).toBe(true);
    expect(matchesHotkey(key({ key: 'K', metaKey: true }), cmdK)).toBe(true);
    expect(matchesHotkey(key({}), cmdK)).toBe(false);
    expect(matchesHotkey(key({ metaKey: true, shiftKey: true }), cmdK)).toBe(false);
    expect(matchesHotkey(key({ ctrlKey: true }), cmdK)).toBe(false);
  });

  it('ignores events during IME composition', () => {
    const enter = parseHotkey('enter', true);
    expect(matchesHotkey(key({ key: 'Enter' }), enter)).toBe(true);
    expect(matchesHotkey(key({ key: 'Enter', isComposing: true }), enter)).toBe(false);
    expect(matchesHotkey(key({ key: 'Process', keyCode: 229 }), enter)).toBe(false);
  });

  it('allows only modifier shortcuts and Escape inside text fields', () => {
    expect(allowedInTextField(parseHotkey('mod+k', true))).toBe(true);
    expect(allowedInTextField(parseHotkey('escape', true))).toBe(true);
    expect(allowedInTextField(parseHotkey('k', true))).toBe(false);
    expect(allowedInTextField(parseHotkey('shift+enter', true))).toBe(false);
  });
});
