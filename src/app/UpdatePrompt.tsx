import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RefreshCw, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { de } from '@/i18n/de';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const OFFLINE_READY_VISIBLE_MS = 4000;

/** Shows a small hint when a new version is available or the app became offline-ready. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) {
        return;
      }
      // Installed PWAs can stay open for days; look for updates regularly.
      setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    if (!offlineReady) {
      return;
    }
    const timer = setTimeout(() => setOfflineReady(false), OFFLINE_READY_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  const visible = needRefresh || offlineReady;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <AnimatePresence>
        {visible && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-black/10 bg-white py-1.5 pr-1.5 pl-5 text-base shadow-lg dark:border-white/10 dark:bg-[#181c25]"
          >
            {needRefresh ? (
              <>
                <span className="font-medium">{de.pwa.updateAvailable}</span>
                <button
                  type="button"
                  onClick={() => void updateServiceWorker(true)}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-[#6d5ef5] px-4 font-medium text-white active:scale-[0.97]"
                >
                  <RefreshCw size={18} aria-hidden />
                  {de.pwa.reload}
                </button>
              </>
            ) : (
              <>
                <WifiOff size={18} aria-hidden className="text-[#10b981]" />
                <span className="pr-2 font-medium">{de.pwa.offlineReady}</span>
              </>
            )}
            <button
              type="button"
              aria-label={de.pwa.dismiss}
              onClick={() => {
                setNeedRefresh(false);
                setOfflineReady(false);
              }}
              className="flex size-11 items-center justify-center rounded-full text-black/50 active:scale-[0.97] dark:text-white/50"
            >
              <X size={18} aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
