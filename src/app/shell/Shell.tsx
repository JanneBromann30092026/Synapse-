import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Spinner, toast } from '@/components/ui';
import { BrainPage } from '@/features/brain/BrainPage';
import { useBrainView } from '@/features/brain/brainViewStore';
import { ProjectPage } from '@/features/projects/ProjectPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { StatsPage } from '@/features/stats/StatsPage';
import { StudyLaunchOverlay } from '@/features/study/StudyLaunchOverlay';
import { StudyPage } from '@/features/study/StudyPage';
import { de } from '@/i18n/de';
import { easeOut } from '@/styles/motion';
import { useReducedMotion } from '@/styles/useReducedMotion';
import { useAppStatus } from '../useAppStatus';
import { useHotkeys } from '../hooks/useHotkeys';
import { useMediaQuery, WIDE_LAYOUT_QUERY } from '../hooks/useMediaQuery';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';

// Developer tools are rarely used: separate chunk.
const DevUiPage = lazy(() => import('@/features/dev/DevUiPage'));

function DatabaseErrorBanner() {
  const database = useAppStatus((s) => s.database);
  if (!database || database.ok) return null;
  return (
    <p
      role="alert"
      data-testid="database-error"
      className="mx-4 mt-[max(1rem,env(safe-area-inset-top))] rounded-lg bg-danger-soft px-4 py-3 text-base text-danger"
    >
      {de.database.errors[database.reason]}
    </p>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const reduced = useReducedMotion();
  const offset = reduced ? 0 : 10;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className="h-full"
        initial={{ opacity: 0, y: offset }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: easeOut } }}
        exit={{ opacity: 0, y: -offset / 2, transition: { duration: 0.12, ease: 'easeIn' } }}
      >
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-fg-muted">
              <Spinner size={28} label={de.ui.loading} />
            </div>
          }
        >
          <Routes location={location}>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectPage />} />
            <Route path="/study/:projectId" element={<StudyPage />} />
            <Route path="/brain" element={<BrainPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/dev/ui" element={<DevUiPage />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

/** The study surface and the brain in full screen hide the navigation (focus mode). */
function useFocusMode(): boolean {
  const { pathname } = useLocation();
  const brainFullscreen = useBrainView((s) => s.fullscreen);
  return pathname.startsWith('/study/') || (pathname === '/brain' && brainFullscreen);
}

export function Shell() {
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const focus = useFocusMode();
  const reduced = useReducedMotion();

  const { pathname } = useLocation();
  // The brain has its own search (⌘K); elsewhere a global search follows later.
  useHotkeys(
    [{ combo: 'mod+k', handler: () => toast.info(de.hotkeys.searchSoon) }],
    pathname !== '/brain',
  );

  return (
    <div className="relative flex h-dvh overflow-hidden" data-layout={wide ? 'wide' : 'narrow'}>
      <AnimatePresence initial={false}>
        {wide && !focus && (
          <motion.div
            key="sidebar"
            className="flex shrink-0"
            initial={{ opacity: 0, x: reduced ? 0 : -24 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.25, ease: easeOut } }}
            exit={{ opacity: 0, x: reduced ? 0 : -24, transition: { duration: 0.15 } }}
          >
            <Sidebar />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <DatabaseErrorBanner />
        <main className="relative min-h-0 flex-1">
          <AnimatedRoutes />
        </main>
        <AnimatePresence initial={false}>
          {!wide && !focus && (
            <motion.div
              key="tabbar"
              initial={{ opacity: 0, y: reduced ? 0 : 24 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: easeOut } }}
              exit={{ opacity: 0, y: reduced ? 0 : 24, transition: { duration: 0.15 } }}
            >
              <TabBar />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <StudyLaunchOverlay />
    </div>
  );
}
