import { useEffect, useState } from 'react';
import { useLiveData } from '@/data/live';
import { cardsRepo } from '@/data/repositories';
import type { Card } from '@/data/types';

/** Cards of a project (optionally searched); undefined while loading. Updates live. */
export function useCards(projectId: string, search = ''): Card[] | undefined {
  return useLiveData(() => cardsRepo.listByProject(projectId, { search }), [projectId, search]);
}

/** Returns the value after it stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
