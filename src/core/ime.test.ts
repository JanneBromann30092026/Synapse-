import { describe, expect, it } from 'vitest';
import type { KeyEventLike } from './hotkeys';
import { ImeGuard } from './ime';

const enter = (overrides: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key: 'Enter',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe('ImeGuard', () => {
  it('lets normal key events through', () => {
    expect(new ImeGuard().isComposing(enter())).toBe(false);
  });

  it('blocks events flagged by the browser (isComposing, keyCode 229)', () => {
    const guard = new ImeGuard();
    expect(guard.isComposing(enter({ isComposing: true }))).toBe(true);
    expect(guard.isComposing(enter({ keyCode: 229 }))).toBe(true);
  });

  it('blocks everything between compositionstart and compositionend', () => {
    let time = 1000;
    const guard = new ImeGuard(() => time);
    guard.compositionStart();
    expect(guard.isComposing(enter())).toBe(true);
    guard.compositionEnd();
    // Safari: the confirming Enter arrives right after compositionend without flags.
    time += 10;
    expect(guard.isComposing(enter())).toBe(true);
    time += 100;
    expect(guard.isComposing(enter())).toBe(false);
  });
});
