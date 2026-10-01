import { useLiveData } from '@/data/live';
import { useState } from 'react';
import { dueCutoff, type DueRound } from '@/core/scheduling/fsrs';
import { projectsRepo, scheduleRepo, sessionsRepo } from '@/data/repositories';
import type { DueCounts, Project, ProjectSummary, StudySession } from '@/data/types';
import { useSettings } from '@/features/settings/settingsStore';

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

/** Start of the next local day when the page opened (cards due before it count as due today). */
function useDueCutoff(): number {
  const [cutoff] = useState(() => dueCutoff(Date.now()));
  return cutoff;
}

/** Due and new cards per project id; undefined while loading. */
export function useDueCounts(): Map<string, DueCounts> | undefined {
  const cutoff = useDueCutoff();
  return useLiveData(() => scheduleRepo.countsByProject(cutoff), [cutoff]);
}

/** Spaced-repetition plan of a project (due, new, next due); undefined while loading. */
export function useDueRound(projectId: string): DueRound | undefined {
  const cutoff = useDueCutoff();
  const newLimit = useSettings((s) => s.newCardsPerRound);
  return useLiveData(
    () => scheduleRepo.projectDue(projectId, newLimit, cutoff),
    [projectId, newLimit, cutoff],
  );
}
