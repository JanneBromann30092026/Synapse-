import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { cn } from './cn';
import { useToasts, type ToastItem } from './toastStore';

const AUTO_DISMISS_MS = { info: 4000, success: 3000, error: 6000 } as const;

const TONES = {
  info: { icon: Info, className: 'text-accent' },
  success: { icon: CircleCheck, className: 'text-success' },
  error: { icon: CircleAlert, className: 'text-danger' },
} as const;

/** Renders the toast stack (mount once in the app root). */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <Toast key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Toast({ item }: { item: ToastItem }) {
  const dismiss = useToasts((s) => s.dismiss);
  const { icon: Icon, className } = TONES[item.tone];

  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), AUTO_DISMISS_MS[item.tone]);
    return () => clearTimeout(timer);
  }, [dismiss, item.id, item.tone]);

  return (
    <motion.div
      layout
      role={item.tone === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: -24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={spring.default}
      className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-line bg-surface-raised py-1.5 pr-1.5 pl-4 shadow-float"
    >
      <Icon size={20} aria-hidden className={cn('shrink-0', className)} />
      <span className="text-base font-medium text-fg">{item.message}</span>
      <button
        type="button"
        aria-label={de.ui.dismiss}
        onClick={() => dismiss(item.id)}
        className="focus-ring flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted hover:text-fg"
      >
        <X size={18} aria-hidden />
      </button>
    </motion.div>
  );
}
