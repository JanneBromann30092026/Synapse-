import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

export interface LongPressPoint {
  x: number;
  y: number;
}

/**
 * Long-press gesture for touch and pen (mouse users get the context menu / hover instead).
 * Spread the returned handlers on the element. `didLongPress()` lets click handlers ignore
 * the click that ends a long press.
 */
export function useLongPress(onLongPress: (point: LongPressPoint) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<LongPressPoint | null>(null);
  const fired = useRef(false);
  const latest = useRef(onLongPress);
  useEffect(() => {
    latest.current = onLongPress;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  return {
    handlers: {
      onPointerDown: (event: PointerEvent) => {
        fired.current = false;
        if (event.pointerType === 'mouse') return;
        const point = { x: event.clientX, y: event.clientY };
        start.current = point;
        timer.current = setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(10);
          latest.current(point);
          cancel();
        }, LONG_PRESS_MS);
      },
      onPointerMove: (event: PointerEvent) => {
        const origin = start.current;
        if (!origin) return;
        if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > MOVE_TOLERANCE_PX) {
          cancel();
        }
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (event: MouseEvent) => {
        // Suppresses the system callout; a right click (mouse, trackpad) opens the same menu.
        event.preventDefault();
        if (fired.current) return;
        fired.current = true;
        cancel();
        latest.current({ x: event.clientX, y: event.clientY });
      },
    },
    didLongPress: () => fired.current,
  };
}
