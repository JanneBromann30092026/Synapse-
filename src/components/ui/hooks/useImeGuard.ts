import { useState, type KeyboardEvent } from 'react';
import { ImeGuard } from '@/core/ime';

/**
 * IME-safe key handling for text fields (Japanese input on iPadOS): spread `compositionProps`
 * on the field and check `isComposing(event)` before reacting to Enter & co.
 */
export function useImeGuard() {
  const [guard] = useState(() => new ImeGuard());
  return {
    compositionProps: {
      onCompositionStart: () => guard.compositionStart(),
      onCompositionEnd: () => guard.compositionEnd(),
    },
    isComposing: (event: KeyboardEvent) =>
      guard.isComposing({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
        keyCode: event.keyCode,
      }),
  };
}
