import { useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { de } from '@/i18n/de';
import { fade, spring } from '@/styles/motion';
import { useEscape } from './hooks/useEscape';
import { useFocusTrap } from './hooks/useFocusTrap';
import { useKeyboardInset } from './hooks/useKeyboardInset';
import { Portal } from './Portal';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

const CLOSE_OFFSET_PX = 120;
const CLOSE_VELOCITY = 600;

/** Sheet sliding up from the bottom; swipe the handle/header down to close. */
export function BottomSheet({ open, onClose, ...rest }: BottomSheetProps) {
  return (
    <Portal>
      <AnimatePresence>
        {open && <SheetPanel key="sheet" onClose={onClose} {...rest} />}
      </AnimatePresence>
    </Portal>
  );
}

function SheetPanel({
  onClose,
  title,
  description,
  children,
  footer,
}: Omit<BottomSheetProps, 'open'>) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  useFocusTrap(panel, true);
  useEscape(onClose, true);
  const keyboardInset = useKeyboardInset();

  const onDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.y > CLOSE_OFFSET_PX || info.velocity.y > CLOSE_VELOCITY) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      // Keeps the sheet above the on-screen keyboard.
      style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
    >
      <motion.div
        className="absolute inset-0 bg-overlay backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fade}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={spring.default}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.05, bottom: 0.7 }}
        onDragEnd={onDragEnd}
        className="relative flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-xl border border-b-0 border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-float outline-none"
      >
        <div
          className="no-callout flex cursor-grab touch-none flex-col items-center px-6 pt-3 pb-2 active:cursor-grabbing"
          onPointerDown={(event) => dragControls.start(event)}
        >
          <span className="h-1.5 w-11 rounded-full bg-line-strong" aria-label={de.ui.close} />
          <div className="mt-4 flex w-full flex-col gap-1">
            <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight text-fg">
              {title}
            </h2>
            {description && (
              <p id={`${id}-desc`} className="text-base text-fg-secondary">
                {description}
              </p>
            )}
          </div>
        </div>
        {children && <div className="scroll-area min-h-0 px-6 pt-2 pb-2">{children}</div>}
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 px-6 pt-4 pb-6">{footer}</footer>
        )}
        {!footer && <div className="h-6" />}
      </motion.div>
    </div>
  );
}
