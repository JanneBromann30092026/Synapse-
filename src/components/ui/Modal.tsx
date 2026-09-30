import { useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { X } from 'lucide-react';
import { de } from '@/i18n/de';
import { fade, spring } from '@/styles/motion';
import { cn } from './cn';
import { useEscape } from './hooks/useEscape';
import { useFocusTrap } from './hooks/useFocusTrap';
import { useKeyboardInset } from './hooks/useKeyboardInset';
import { IconButton } from './IconButton';
import { Portal } from './Portal';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Buttons at the bottom, right-aligned. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Role "alertdialog" for confirmations. */
  role?: 'dialog' | 'alertdialog';
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

export function Modal({ open, onClose, ...rest }: ModalProps) {
  return (
    <Portal>
      <AnimatePresence>
        {open && <ModalPanel key="modal" onClose={onClose} {...rest} />}
      </AnimatePresence>
    </Portal>
  );
}

function ModalPanel({
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  role = 'dialog',
}: Omit<ModalProps, 'open'>) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  // While fading out, taps already reach the page below.
  const isPresent = useIsPresent();
  useFocusTrap(panel, true);
  useEscape(onClose, true);
  const keyboardInset = useKeyboardInset();

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] transition-[padding] duration-200',
        !isPresent && 'pointer-events-none',
      )}
      // Keeps the dialog above the on-screen keyboard.
      style={keyboardInset ? { paddingBottom: keyboardInset + 16 } : undefined}
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
        role={role}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={spring.default}
        className={cn(
          'relative flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-surface-raised shadow-float outline-none',
          SIZES[size],
        )}
      >
        <header className="flex items-start gap-3 px-6 pt-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2">
            <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight text-fg">
              {title}
            </h2>
            {description && (
              <p id={`${id}-desc`} className="text-base text-fg-secondary">
                {description}
              </p>
            )}
          </div>
          <IconButton icon={X} label={de.ui.close} onClick={onClose} className="-mr-2" />
        </header>
        {children && <div className="scroll-area min-h-0 px-6 pt-4 pb-2">{children}</div>}
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 px-6 pt-4 pb-6">{footer}</footer>
        )}
        {!footer && <div className="h-4" />}
      </motion.div>
    </div>
  );
}
