import { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { projectsRepo } from '@/data/repositories';
import { useLiveData } from '@/data/live';
import { useSettings } from '@/features/settings/settingsStore';
import { readOnboardingFlag, writeOnboardingFlag } from './onboardingFlag';

const Onboarding = lazy(() => import('./Onboarding'));

/**
 * Shows the welcome on the very first start: settings loaded, not done yet and no projects.
 * Devices that already have projects (updates from older versions) skip it silently.
 */
export function OnboardingGate() {
  const loaded = useSettings((s) => s.loaded);
  const done = useSettings((s) => s.onboardingDone) || readOnboardingFlag();
  const projectCount = useLiveData(() => projectsRepo.count());
  const hasProjects = projectCount !== undefined && projectCount > 0;

  useEffect(() => {
    if (!loaded || done || !hasProjects) return;
    writeOnboardingFlag();
    void useSettings.getState().set('onboardingDone', true);
  }, [loaded, done, hasProjects]);

  const show = loaded && !done && projectCount !== undefined && !hasProjects;
  return (
    <Suspense fallback={null}>
      <AnimatePresence>{show && <Onboarding key="onboarding" />}</AnimatePresence>
    </Suspense>
  );
}
