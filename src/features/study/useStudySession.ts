import { useEffect, useState, useSyncExternalStore } from 'react';
import { currentCard, roundStats } from '@/core/session';
import { createStudyController } from './studyController';

/**
 * React binding of a study round. `scope` is the project id (or 'cross'); a running round of
 * that scope survives unmounting, backgrounding and an iOS reload (sessionStorage).
 * Callers should key the component by scope, the controller is created once per mount.
 */
export function useStudySession(scope: string) {
  const [controller] = useState(() => createStudyController(scope));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  useEffect(() => {
    controller.resume();
    const onHide = () => {
      if (document.visibilityState === 'hidden') controller.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', controller.flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', controller.flush);
      controller.flush();
    };
  }, [controller]);

  return {
    state,
    stats: roundStats(state),
    current: currentCard(state),
    start: controller.start,
    startNextRound: controller.startNextRound,
    setInput: controller.setInput,
    submit: controller.submit,
    selfAssess: controller.selfAssess,
    override: controller.override,
    next: controller.next,
    retry: controller.retry,
    abort: controller.abort,
    reset: controller.reset,
  };
}

export type StudySession = ReturnType<typeof useStudySession>;
