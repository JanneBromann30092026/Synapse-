import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { spring } from '@/styles/motion';
import { useLongPress } from './hooks/useLongPress';
import { Portal } from './Portal';

export interface TooltipProps {
  content: string;
  children: ReactNode;
  /** Tap toggles the tooltip (for info icons). Otherwise touch users long-press. */
  showOnTap?: boolean;
}

const AUTO_HIDE_MS = 2500;
const GAP = 8;

/** Hover (mouse), focus (keyboard), long press or tap (touch). */
export function Tooltip({ content, children, showOnTap = false }: TooltipProps) {
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const longPress = useLongPress(() => setVisible(true));

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <>
      <span
        ref={setAnchor}
        className="no-callout inline-flex"
        aria-describedby={visible ? id : undefined}
        {...longPress.handlers}
        onPointerEnter={(event) => event.pointerType === 'mouse' && setVisible(true)}
        onPointerLeave={(event) => {
          longPress.handlers.onPointerLeave();
          if (event.pointerType === 'mouse') setVisible(false);
        }}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onClickCapture={(event) => {
          if (longPress.didLongPress()) {
            event.preventDefault();
            event.stopPropagation();
          } else if (showOnTap) {
            setVisible((v) => !v);
          }
        }}
      >
        {children}
      </span>
      <Portal>
        <AnimatePresence>
          {visible && anchor && (
            <TooltipBubble key="tooltip" id={id} anchor={anchor} content={content} />
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}

function TooltipBubble({
  id,
  anchor,
  content,
}: {
  id: string;
  anchor: HTMLElement;
  content: string;
}) {
  const bubble = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const element = bubble.current;
    if (!element) return;
    const target = anchor.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    let top = target.top - height - GAP;
    if (top < GAP) top = target.bottom + GAP;
    const left = Math.min(
      Math.max(GAP, target.left + target.width / 2 - width / 2),
      window.innerWidth - width - GAP,
    );
    setPosition({ left, top });
  }, [anchor]);

  return (
    <motion.div
      ref={bubble}
      id={id}
      role="tooltip"
      initial={{ opacity: 0, y: 4, scale: 0.96 }}
      animate={{ opacity: position ? 1 : 0, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={spring.snappy}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
      className="pointer-events-none fixed z-[60] max-w-72 rounded-md bg-fg px-3 py-2 text-sm text-bg shadow-float"
    >
      {content}
    </motion.div>
  );
}
