import type { Mastery } from '@/core/mastery';
import { useLiveData } from '@/data/live';
import { statsRepo, type ActivityStats, type StatsOverview } from '@/data/repositories';

/** Mastery totals, per project and the hardest cards; undefined while loading. Updates live. */
export function useStatsOverview(): StatsOverview | undefined {
  return useLiveData(() => statsRepo.overview());
}

/** Answers per day, answers today and the streak; undefined while loading. */
export function useActivity(): ActivityStats | undefined {
  return useLiveData(() => statsRepo.activity());
}

/** Mastery per card id of a project; undefined while loading. */
export function useProjectMastery(projectId: string): Map<string, Mastery> | undefined {
  return useLiveData(() => statsRepo.masteryByProject(projectId), [projectId]);
}
