import { useEffect } from 'react';
import { HashRouter } from 'react-router';
import { MotionConfig } from 'motion/react';
import { Toaster } from '@/components/ui';
import { useSettings } from '@/features/settings/settingsStore';
import { startBrainBackgroundSync } from '@/services/brain';
import { runAutoSnapshot } from '@/services/transfer/backups';
import { Background } from './Background';
import { ErrorBoundary } from './ErrorBoundary';
import { Shell } from './shell/Shell';
import { applyReduceMotion, applyTheme, onSystemThemeChange } from './theme';
import { UpdatePrompt } from './UpdatePrompt';
import { useAppStatus } from './useAppStatus';

function useStartup() {
  const init = useAppStatus((s) => s.init);
  const loadSettings = useSettings((s) => s.load);
  useEffect(() => {
    void (async () => {
      await init();
      if (!useAppStatus.getState().database?.ok) return;
      await loadSettings();
      // At most once a day, a snapshot of all data inside the app.
      await runAutoSnapshot();
    })();
  }, [init, loadSettings]);
}

/** Keeps embeddings and links current once the settings are loaded. */
function useBrainBackgroundSync() {
  const loaded = useSettings((s) => s.loaded);
  useEffect(() => (loaded ? startBrainBackgroundSync() : undefined), [loaded]);
}

function useThemeSync() {
  const theme = useSettings((s) => s.theme);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    return onSystemThemeChange(() => applyTheme('system'));
  }, [theme]);
  useEffect(() => applyReduceMotion(reduceMotion), [reduceMotion]);
}

export function App() {
  useStartup();
  useThemeSync();
  useBrainBackgroundSync();
  const reduceMotion = useSettings((s) => s.reduceMotion);

  return (
    <ErrorBoundary>
      {/* "user" follows the system setting; the app setting forces reduced motion. */}
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
        <HashRouter>
          <Background />
          <Shell />
          <Toaster />
          <UpdatePrompt />
        </HashRouter>
      </MotionConfig>
    </ErrorBoundary>
  );
}
