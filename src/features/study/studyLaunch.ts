import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';
import { CROSS_PROJECT_ID, type ProjectColor } from '@/data/types';
import { useReducedMotion } from '@/styles/useReducedMotion';

/**
 * Transition between a "Lernen" button and the full-screen study surface: the button expands
 * (shared layoutId) into a surface in the project color, which then fades into the neutral
 * study background. The way back runs in reverse.
 */
export type LaunchStage = 'idle' | 'expanding' | 'arrived' | 'returning';

interface LaunchState {
  stage: LaunchStage;
  projectId: string | null;
  color: ProjectColor | null;
  /** Route to return to (project page or project list). */
  returnPath: string;
  /** Route of the study page (cross-project rounds carry their card ids). */
  studyPath: string;
  expand: (projectId: string, color: ProjectColor, returnPath: string, studyPath?: string) => void;
  arrive: () => void;
  returnFrom: (projectId: string, color: ProjectColor) => void;
  finish: () => void;
}

export const useStudyLaunch = create<LaunchState>((set) => ({
  stage: 'idle',
  projectId: null,
  color: null,
  returnPath: '/projects',
  studyPath: '/projects',
  expand: (projectId, color, returnPath, studyPath = `/study/${projectId}`) =>
    set({ stage: 'expanding', projectId, color, returnPath, studyPath }),
  arrive: () => set((s) => (s.stage === 'expanding' ? { stage: 'arrived' } : s)),
  returnFrom: (projectId, color) =>
    set((s) => ({
      stage: 'returning',
      projectId,
      color,
      // Direct opens (reload, deep link) return to the project page.
      returnPath: s.projectId === projectId ? s.returnPath : defaultReturnPath(projectId),
    })),
  finish: () => set({ stage: 'idle' }),
}));

/** Where a study page opened directly (reload, deep link) returns to. */
export function defaultReturnPath(projectId: string): string {
  return projectId === CROSS_PROJECT_ID ? '/stats' : `/projects/${projectId}`;
}

/** Study route of a cross-project round with exactly these cards. */
export function crossStudyPath(cardIds: readonly string[]): string {
  return `/study/${CROSS_PROJECT_ID}?cards=${cardIds.join(',')}`;
}

/** layoutId shared by the "Lernen" buttons of a project and the expanding surface. */
export function studyLayoutId(projectId: string): string {
  return `study-launch-${projectId}`;
}

/** Opens the study page of a project with the expanding transition (instantly with reduced motion). */
export function useLaunchStudy() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  return useCallback(
    (
      project: { id: string; color: ProjectColor },
      returnPath: string,
      studyPath = `/study/${project.id}`,
    ) => {
      if (reduced) {
        useStudyLaunch.setState({ projectId: project.id, returnPath, studyPath, stage: 'idle' });
        void navigate(studyPath);
        return;
      }
      useStudyLaunch.getState().expand(project.id, project.color, returnPath, studyPath);
    },
    [navigate, reduced],
  );
}

/** Leaves the study page (reverse transition). */
export function useLeaveStudy() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  return useCallback(
    (project: { id: string; color: ProjectColor } | null | undefined) => {
      const store = useStudyLaunch.getState();
      if (reduced || !project) {
        const path =
          project && store.projectId === project.id
            ? store.returnPath
            : project
              ? defaultReturnPath(project.id)
              : '/projects';
        store.finish();
        void navigate(path);
        return;
      }
      store.returnFrom(project.id, project.color);
    },
    [navigate, reduced],
  );
}
