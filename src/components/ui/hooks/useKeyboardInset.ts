import { useEffect, useState } from 'react';

/**
 * Height in px that the on-screen keyboard covers at the bottom of the layout viewport.
 * iPadOS does not resize the page for the keyboard in home screen apps, only the visual viewport.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      // Ignore tiny differences (browser chrome, rounding).
      setInset(covered > 80 ? Math.round(covered) : 0);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}
