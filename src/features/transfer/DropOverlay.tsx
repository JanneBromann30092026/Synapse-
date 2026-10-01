import { AnimatePresence, motion } from 'motion/react';
import { FileDown } from 'lucide-react';
import { Portal } from '@/components/ui/Portal';
import { de } from '@/i18n/de';
import { fade } from '@/styles/motion';

/** Full-screen hint while a file is dragged over the page. */
export function DropOverlay({ visible }: { visible: boolean }) {
  return (
    <Portal>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-overlay p-6 backdrop-blur-sm"
            data-testid="drop-overlay"
          >
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-accent bg-surface-raised px-10 py-8 text-center shadow-float">
              <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
                <FileDown size={28} aria-hidden />
              </span>
              <span className="text-lg font-semibold text-fg">{de.transfer.drop.title}</span>
              <span className="text-sm text-fg-secondary">{de.transfer.drop.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
