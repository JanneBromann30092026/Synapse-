/**
 * Hotkey matching without DOM dependencies. Combos are written like "mod+k", "shift+enter",
 * "escape". "mod" is Cmd on Apple devices and Ctrl elsewhere.
 */

export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** True while an IME composition (e.g. Japanese input) is active. */
  isComposing?: boolean;
  /** Legacy keyCode; 229 marks IME processing in Safari. */
  keyCode?: number;
}

export interface ParsedHotkey {
  key: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  space: ' ',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
};

export function parseHotkey(combo: string, isApple: boolean): ParsedHotkey {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const parsed: ParsedHotkey = { key: '', meta: false, ctrl: false, alt: false, shift: false };
  for (const part of parts) {
    switch (part) {
      case 'mod':
        if (isApple) parsed.meta = true;
        else parsed.ctrl = true;
        break;
      case 'cmd':
      case 'meta':
        parsed.meta = true;
        break;
      case 'ctrl':
        parsed.ctrl = true;
        break;
      case 'alt':
      case 'option':
        parsed.alt = true;
        break;
      case 'shift':
        parsed.shift = true;
        break;
      default:
        parsed.key = KEY_ALIASES[part] ?? part;
    }
  }
  return parsed;
}

/** True while the key event belongs to an IME composition and must not trigger shortcuts. */
export function isImeEvent(event: KeyEventLike): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

export function matchesHotkey(event: KeyEventLike, hotkey: ParsedHotkey): boolean {
  if (isImeEvent(event)) return false;
  return (
    event.key.toLowerCase() === hotkey.key &&
    event.metaKey === hotkey.meta &&
    event.ctrlKey === hotkey.ctrl &&
    event.altKey === hotkey.alt &&
    event.shiftKey === hotkey.shift
  );
}

/** Shortcuts with Cmd/Ctrl/Alt also work inside text fields; plain keys only outside of them. */
export function allowedInTextField(hotkey: ParsedHotkey): boolean {
  return hotkey.meta || hotkey.ctrl || hotkey.alt || hotkey.key === 'escape';
}
