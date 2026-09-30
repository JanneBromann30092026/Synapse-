import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';
import type { ProjectColor } from '@/data/types';
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
  expand: (projectId: string, color: ProjectColor, returnPath: string) => void;
  arrive: () => void;
  returnFrom: (projectId: string, color: ProjectColor) => void;
  finish: () => void;
}

export const useStudyLaunch = create<LaunchState>((set) => ({
  stage: 'idle',
  projectId: null,
  color: null,
  returnPath: '/projects',
  expand: (projectId, color, returnPath) =>
    set({ stage: 'expanding', projectId, color, returnPath }),
  arrive: () => set((s) => (s.stage === 'expanding' ? { stage: 'arrived' } : s)),
  returnFrom: (projectId, color) =>
    set((s) => ({
      stage: 'returning',
      projectId,
      color,
      // Direct opens (reload, deep link) return to the project page.
      returnPath: s.projectId === projectId ? s.returnPath : `/projects/${projectId}`,
    })),
  finish: () => set({ stage: 'idle' }),
}));

/** layoutId shared by the "Lernen" buttons of a project and the expanding surface. */
export function studyLayoutId(projectId: string): string {
  return `study-launch-${projectId}`;
}

/** Opens the study page of a project with the expanding transition (instantly with reduced motion). */
export function useLaunchStudy() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  return useCallback(
    (project: { id: string; color: ProjectColor }, returnPath: string) => {
      if (reduced) {
        useStudyLaunch.setState({ projectId: project.id, returnPath, stage: 'idle' });
        void navigate(`/study/${project.id}`);
        return;
      }
      useStudyLaunch.getState().expand(project.id, project.color, returnPath);
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
              ? `/projects/${project.id}`
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
