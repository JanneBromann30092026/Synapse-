import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { projectColor } from '@/components/ui';
import { studyLayoutId, useStudyLaunch } from './studyLaunch';

/** Fallback if a layout animation never reports completion (e.g. the button is off screen). */
const MAX_EXPAND_MS = 750;
/** The target page's button takes over (shared layout) while the surface fades out. */
const RETURN_HANDOVER_MS = 180;
const MAX_RETURN_MS = 1500;

const expandTransition = { type: 'spring', stiffness: 210, damping: 30 } as const;

/**
 * Full-screen surface in the project color for the study transition. Lives in the shell, outside
 * the animated routes, so it stays on screen while the pages change underneath.
 */
export function StudyLaunchOverlay() {
  const { stage, projectId, color, studyPath } = useStudyLaunch();
  const navigate = useNavigate();
  const navigated = useRef<string | null>(null);

  const goToStudy = () => {
    if (stage !== 'expanding' || !projectId || navigated.current === `study:${projectId}`) return;
    navigated.current = `study:${projectId}`;
    void navigate(studyPath);
  };

  useEffect(() => {
    if (stage === 'idle') navigated.current = null;
    if (stage === 'expanding' && projectId) {
      const timer = setTimeout(() => {
        if (navigated.current === `study:${projectId}`) return;
        navigated.current = `study:${projectId}`;
        void navigate(studyPath);
      }, MAX_EXPAND_MS);
      return () => clearTimeout(timer);
    }
    if (stage === 'returning') {
      const settle = setTimeout(() => {
        const current = useStudyLaunch.getState();
        if (navigated.current !== `back:${projectId}`) void navigate(current.returnPath);
        current.finish();
      }, MAX_RETURN_MS);
      return () => clearTimeout(settle);
    }
  }, [stage, projectId, studyPath, navigate]);

  const visible = stage !== 'idle' && projectId && color;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={projectId}
          layoutId={studyLayoutId(projectId)}
          layoutCrossfade={false}
          aria-hidden
          data-testid="study-launch-overlay"
          className="pointer-events-none fixed inset-0 z-40"
          style={{ background: projectColor(color), borderRadius: 0 }}
          initial={{ opacity: stage === 'returning' ? 0 : 1 }}
          animate={{ opacity: stage === 'arrived' ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{
            layout: expandTransition,
            opacity: { duration: stage === 'arrived' ? 0.45 : 0.2, ease: 'easeOut' },
          }}
          onLayoutAnimationComplete={goToStudy}
          onAnimationComplete={() => {
            const current = useStudyLaunch.getState();
            if (current.stage === 'arrived') current.finish();
            if (current.stage === 'returning' && navigated.current !== `back:${projectId}`) {
              navigated.current = `back:${projectId}`;
              void navigate(current.returnPath);
              setTimeout(() => useStudyLaunch.getState().finish(), RETURN_HANDOVER_MS);
            }
          }}
        />
      )}
    </AnimatePresence>
  );
}
