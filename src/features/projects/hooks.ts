import { useLiveData } from '@/data/live';
import { projectsRepo } from '@/data/repositories';
import type { Project, ProjectSummary } from '@/data/types';

/** All projects (incl. archived) with card count and last study date; undefined while loading. */
export function useProjects(): ProjectSummary[] | undefined {
  return useLiveData(() => projectsRepo.list());
}

/** One project; undefined while loading, null if it does not exist. */
export function useProject(id: string): Project | null | undefined {
  return useLiveData(async () => (await projectsRepo.get(id)) ?? null, [id]);
}
