import { useEffect, useState } from 'react';
import type { Size } from '@/core/study/presentation';

/**
 * Content box size of an element, updated on resize (orientation, keyboard, Split View).
 * Returns a callback ref, so a remounted element is observed again.
 */
export function useElementSize<T extends HTMLElement>(): [(element: T | null) => void, Size] {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, size];
}
