import { useEffect, useRef } from 'react';
import { allowedInTextField, matchesHotkey, parseHotkey } from '@/core/hotkeys';

export interface Hotkey {
  /** e.g. "mod+k", "escape", "shift+enter" */
  combo: string;
  handler: (event: KeyboardEvent) => void;
  /** Overrides the default: modifier shortcuts work in text fields, plain keys do not. */
  allowInTextFields?: boolean;
}

const IS_APPLE = /Mac|iPhone|iPad|iPod/.test(globalThis.navigator?.userAgent ?? '');

export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return (
    target instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'button', 'submit', 'range'].includes(target.type)
  );
}

/** Keyboard shortcuts for hardware keyboards. Respects text fields and IME composition. */
export function useHotkeys(hotkeys: Hotkey[], enabled = true): void {
  const latest = useRef(hotkeys);
  useEffect(() => {
    latest.current = hotkeys;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const inTextField = isTextField(event.target);
      for (const hotkey of latest.current) {
        const parsed = parseHotkey(hotkey.combo, IS_APPLE);
        if (!matchesHotkey(event, parsed)) continue;
        if (inTextField && !(hotkey.allowInTextFields ?? allowedInTextField(parsed))) continue;
        event.preventDefault();
        hotkey.handler(event);
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
