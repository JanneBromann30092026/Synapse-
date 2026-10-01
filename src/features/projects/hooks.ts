import { useLiveData } from '@/data/live';
import { projectsRepo, sessionsRepo } from '@/data/repositories';
import type { Project, ProjectSummary, StudySession } from '@/data/types';

/** All projects (incl. archived) with card count and last study date; undefined while loading. */
export function useProjects(): ProjectSummary[] | undefined {
  return useLiveData(() => projectsRepo.list());
}

/** One project; undefined while loading, null if it does not exist. */
export function useProject(id: string): Project | null | undefined {
  return useLiveData(async () => (await projectsRepo.get(id)) ?? null, [id]);
}

/** Last completed round of a project; undefined while loading, null if there is none. */
export function useLastRound(projectId: string): StudySession | null | undefined {
  return useLiveData(
    async () => (await sessionsRepo.getLastCompleted(projectId)) ?? null,
    [projectId],
  );
}
