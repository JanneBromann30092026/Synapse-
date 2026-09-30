import { isImeEvent, type KeyEventLike } from './hotkeys';

/**
 * Tracks IME composition (Japanese kana/kanji input on iPadOS) for text fields.
 * Safari sends the Enter that confirms a composition *after* compositionend, with
 * isComposing=false but keyCode 229 – and sometimes without it. Therefore key events are
 * ignored during a composition and for a short moment after it ended.
 */
export class ImeGuard {
  private composing = false;
  private endedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly graceMs = 60,
  ) {}

  compositionStart(): void {
    this.composing = true;
  }

  compositionEnd(): void {
    this.composing = false;
    this.endedAt = this.now();
  }

  /** True if the key event belongs to an IME composition and must not trigger actions. */
  isComposing(event: KeyEventLike): boolean {
    return this.composing || isImeEvent(event) || this.now() - this.endedAt < this.graceMs;
  }
}
